package com.smartadv.backend.service;

import com.smartadv.backend.domain.AnalysisJob;
import com.smartadv.backend.domain.Result;
import com.smartadv.backend.domain.Video;
import com.smartadv.backend.repository.AnalysisJobRepository;
import com.smartadv.backend.repository.ResultRepository;
import com.smartadv.backend.repository.VideoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkerClientService {

    private final AnalysisJobRepository analysisJobRepository;
    private final ResultRepository resultRepository;
    private final VideoRepository videoRepository;

    @Value("${smartadv.storage.mock-s3-dir}")
    private String mockStorageLocation;

    @Value("${smartadv.engine.root-dir:..}")
    private String engineRootDir;

    @Value("${smartadv.engine.command:poetry run python}")
    private String engineCommand;

    private final StorageService storageService;

    // Pattern to match PROGRESS:XX:message from Python stdout
    private static final Pattern PROGRESS_PATTERN = Pattern.compile("^PROGRESS:(\\d+):(.+)$");

    // 실행 중인 프로세스를 jobId로 추적 (취소 기능용)
    private final ConcurrentHashMap<Long, Process> runningProcesses = new ConcurrentHashMap<>();

    @Async("pipelineExecutor")
    public void executeMockPipeline(Long videoId, AnalysisJob job) {
        try {
            log.info("Starting Actual Script Pipeline for video {}", videoId);

            // 0. Get original video
            Video video = videoRepository.findById(videoId)
                    .orElseThrow(() -> new RuntimeException("Video not found: " + videoId));

            // 1. Create Workspace
            Path workspace = Paths.get(mockStorageLocation).toAbsolutePath().normalize().resolve("job_" + job.getId());
            Files.createDirectories(workspace);

            Path inputVideoPath = workspace.resolve("input.mp4");
            
            // DOWNLOAD FROM S3 / YOUTUBE
            if (video.getS3Url().startsWith("mock-s3://")) {
                String localOriginalPath = video.getS3Url().replace("mock-s3://", "");
                Files.copy(Paths.get(localOriginalPath), inputVideoPath, StandardCopyOption.REPLACE_EXISTING);
            } else if (video.getS3Url().startsWith("youtube:")) {
                String youtubeUrl = video.getS3Url().replace("youtube:", "");
                log.info("Downloading video from YouTube using yt-dlp: {}", youtubeUrl);
                updateJobDetail(job.getId(), "유튜브 동영상 다운로드 중...", 1);
                
                // Run yt-dlp command to download the video directly as input.mp4
                List<String> ytdlCmd = new ArrayList<>();
                ytdlCmd.add("yt-dlp");
                
                // Add cookies if cookies file exists
                Path cookiesPath = Paths.get("/opt/smartadv/cookies.txt");
                if (Files.exists(cookiesPath)) {
                    ytdlCmd.add("--cookies");
                    ytdlCmd.add(cookiesPath.toString());
                    log.info("Using cookies file for yt-dlp to bypass bot detection: {}", cookiesPath);
                }
                
                // Explicitly request node as JS runtime to decrypt signature challenge
                ytdlCmd.add("--js-runtimes");
                ytdlCmd.add("node");
                
                ytdlCmd.add("-f");
                ytdlCmd.add("best[ext=mp4]/best");
                ytdlCmd.add("--merge-output-format");
                ytdlCmd.add("mp4");
                ytdlCmd.add("-o");
                ytdlCmd.add(inputVideoPath.toString());
                ytdlCmd.add(youtubeUrl);
                
                ProcessBuilder pb = new ProcessBuilder(ytdlCmd);
                pb.redirectErrorStream(true);
                Process process = pb.start();
                
                // Keep track of the process for cancellation
                runningProcesses.put(job.getId(), process);
                
                try (BufferedReader br = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        log.info("[yt-dlp] {}", line);
                    }
                }
                
                int exitCode = process.waitFor();
                runningProcesses.remove(job.getId());
                
                if (exitCode != 0) {
                    throw new RuntimeException("yt-dlp failed to download YouTube video. Exit code: " + exitCode);
                }
            } else {
                log.info("Downloading video from S3: {}", video.getS3Url());
                storageService.downloadFile(video.getS3Url(), inputVideoPath);
            }

            String smartadvInput = inputVideoPath.toString();
            String smartadvOutput = workspace.resolve("output_clips").toString();

            // 2. PREPROCESSING (0% ~ 33%)
            updateJobStatus(job.getId(), "PREPROCESSING", 1);
            updateJobDetail(job.getId(), "전처리 엔진 시작 중...", 1);
            int exitCode = runPythonProcess("engine.py", smartadvInput, smartadvOutput, job.getId());
            checkCancelled(job.getId());
            if (exitCode != 0) throw new RuntimeException("engine.py failed with exit code " + exitCode);

            // 3. SCRIPT_GENERATING (34% ~ 66%)
            updateJobStatus(job.getId(), "SCRIPT_GENERATING", 34);
            updateJobDetail(job.getId(), "해설 대본 생성 엔진 시작 중...", 34);
            exitCode = runPythonProcess("LLM.py", smartadvInput, smartadvOutput, job.getId());
            checkCancelled(job.getId());
            if (exitCode != 0) throw new RuntimeException("LLM.py failed with exit code " + exitCode);

            // Read token usage info written by LLM.py
            try {
                Path tokenUsageFile = Paths.get(smartadvOutput).resolve("token_usage.txt");
                if (Files.exists(tokenUsageFile)) {
                    String content = Files.readString(tokenUsageFile).trim();
                    String[] parts = content.split(",");
                    if (parts.length >= 2) {
                        Long inputTokens = Long.parseLong(parts[0]);
                        Long outputTokens = Long.parseLong(parts[1]);
                        analysisJobRepository.findById(job.getId()).ifPresent(j -> {
                            j.updateLlmTokens(inputTokens, outputTokens);
                            analysisJobRepository.save(j);
                            log.info("Successfully updated LLM token usage for job {}: input={}, output={}", 
                                    job.getId(), inputTokens, outputTokens);
                        });
                    }
                }
            } catch (Exception e) {
                log.error("Failed to read or parse LLM token usage file for job " + job.getId(), e);
            }

            // 4. TTS_GENERATING (67% ~ 99%)
            updateJobStatus(job.getId(), "TTS_GENERATING", 67);
            updateJobDetail(job.getId(), "음성 합성 엔진 시작 중...", 67);
            exitCode = runPythonProcess("TTS.py", smartadvInput, smartadvOutput, job.getId());
            checkCancelled(job.getId());
            if (exitCode != 0) throw new RuntimeException("TTS.py failed with exit code " + exitCode);

            // 5. DONE -> Generate Result object
            Path finalVideo = workspace.resolve("output_clips").resolve("input_with_ad.mp4");
            Path finalAudio = workspace.resolve("output_clips").resolve("input_with_ad_audio.m4a");

            log.info("Uploading processed files to S3...");
            String finalVideoS3Url = storageService.uploadFile(finalVideo);
            String finalAudioS3Url = storageService.uploadFile(finalAudio);

            Result result = Result.builder()
                .jobId(job.getId())
                .userId(job.getUserId())
                .scriptText("자동 추출된 화면 해설 스크립트 기반 생성 결과물입니다.")
                .narrationAudioPath(finalAudioS3Url)
                .mergedVideoPath(finalVideoS3Url)
                .build();
            resultRepository.save(result);

            updateJobDetail(job.getId(), "모든 처리 완료! 임시 파일 정리 중...", 99);
            
            // CLEAN UP WORKSPACE
            deleteDirectoryRecursively(workspace);

            updateJobDetail(job.getId(), "모든 처리 완료!", 100);
            updateJobStatus(job.getId(), "DONE", 100);
            log.info("Finished Pipeline for video {}", videoId);

        } catch (InterruptedException e) {
            log.error("Pipeline interrupted", e);
            updateJobStatus(job.getId(), "CANCELLED", 0);
            Thread.currentThread().interrupt();
        } catch (CancellationException e) {
            log.info("Pipeline cancelled by user for job {}", job.getId());
            // 상태는 cancelJob()에서 이미 CANCELLED로 설정됨
        } catch (Exception e) {
            log.error("Pipeline failed", e);
            updateJobDetail(job.getId(), "오류 발생: " + e.getMessage(), 0);
            updateJobStatus(job.getId(), "FAILED", 0);
        }
    }

    /**
     * 사용자가 페이지를 이탈할 때 호출 — 실행 중인 프로세스를 강제 종료합니다.
     */
    public boolean cancelJob(Long videoId) {
        return analysisJobRepository.findByVideoId(videoId).map(job -> {
            Long jobId = job.getId();
            Process process = runningProcesses.remove(jobId);
            if (process != null && process.isAlive()) {
                log.info("Cancelling job {} (videoId={}), destroying process", jobId, videoId);
                process.destroyForcibly();
            }
            updateJobDetail(jobId, "사용자에 의해 취소됨", 0);
            updateJobStatus(jobId, "CANCELLED", 0);

            // 작업 디렉토리 정리
            Path workspace = Paths.get(mockStorageLocation).toAbsolutePath().normalize().resolve("job_" + jobId);
            deleteDirectoryRecursively(workspace);

            return true;
        }).orElse(false);
    }

    private void checkCancelled(Long jobId) {
        analysisJobRepository.findById(jobId).ifPresent(j -> {
            if ("CANCELLED".equals(j.getStatus())) {
                throw new CancellationException("Job " + jobId + " was cancelled");
            }
        });
    }

    private static class CancellationException extends RuntimeException {
        CancellationException(String message) { super(message); }
    }

    private void updateJobStatus(Long jobId, String status, int progress) {
        analysisJobRepository.findById(jobId).ifPresent(j -> {
            j.updateStatus(status, progress);
            analysisJobRepository.save(j);
        });
    }

    private void deleteDirectoryRecursively(Path path) {
        try {
            if (Files.exists(path)) {
                Files.walk(path)
                     .sorted(java.util.Comparator.reverseOrder())
                     .map(Path::toFile)
                     .forEach(java.io.File::delete);
            }
        } catch (java.io.IOException e) {
            log.warn("Failed to delete workspace: " + path, e);
        }
    }

    private void updateJobDetail(Long jobId, String detail, int progress) {
        analysisJobRepository.findById(jobId).ifPresent(j -> {
            j.updateStatusDetail(detail, progress);
            analysisJobRepository.save(j);
        });
    }

    private int runPythonProcess(String scriptName, String smartadvInput, String smartadvOutput, Long jobId) throws Exception {
        // SmartADV Python engine root directory (configurable via smartadv.engine.root-dir)
        Path projectRoot = Paths.get(engineRootDir).toAbsolutePath().normalize();
        List<String> command = new ArrayList<>(parseEngineCommand(engineCommand));
        command.add(scriptName);
        log.info("Executing {} (cwd={})", String.join(" ", command), projectRoot);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(projectRoot.toFile());

        // Pass dynamic IO environment variables
        pb.environment().put("SMARTADV_INPUT", smartadvInput);
        pb.environment().put("SMARTADV_OUTPUT", smartadvOutput);
        pb.environment().put("PYTHONUNBUFFERED", "1");

        // Pass user setting clipMode and imageResolution
        AnalysisJob curJob = analysisJobRepository.findById(jobId).orElse(null);
        String clipModeVal = (curJob != null && curJob.getClipMode() != null) ? curJob.getClipMode() : "AUTO";
        pb.environment().put("SMARTADV_CLIP_MODE", clipModeVal);

        String imageResVal = (curJob != null && curJob.getImageResolution() != null) ? curJob.getImageResolution() : "LOW";
        pb.environment().put("GEMINI_IMAGE_RESOLUTION", imageResVal);

        // Modal 인증 토큰 전달 (modal deploy 이후 engine_backup.py에서 .remote()/.map() 호출에 필요)
        String modalTokenId = System.getenv("MODAL_TOKEN_ID");
        String modalTokenSecret = System.getenv("MODAL_TOKEN_SECRET");
        if (modalTokenId != null && modalTokenSecret != null) {
            pb.environment().put("MODAL_TOKEN_ID", modalTokenId);
            pb.environment().put("MODAL_TOKEN_SECRET", modalTokenSecret);
        }

        pb.redirectErrorStream(true);
        Process process = pb.start();
        runningProcesses.put(jobId, process);

        StringBuilder lastLines = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = br.readLine()) != null) {
                log.info("[{}] {}", scriptName, line);
                // 마지막 20줄 보관 (에러 발생 시 디버깅용)
                lastLines.append(line).append("\n");
                String[] stored = lastLines.toString().split("\n");
                if (stored.length > 20) {
                    lastLines = new StringBuilder();
                    for (int i = stored.length - 20; i < stored.length; i++) {
                        lastLines.append(stored[i]).append("\n");
                    }
                }

                // Parse PROGRESS:XX:message lines from Python
                Matcher m = PROGRESS_PATTERN.matcher(line);
                if (m.matches()) {
                    int pct = Integer.parseInt(m.group(1));
                    String detail = m.group(2);
                    updateJobDetail(jobId, detail, pct);
                }
            }
        }

        int exitCode = process.waitFor();
        runningProcesses.remove(jobId);
        if (exitCode != 0) {
            log.error("[{}] 비정상 종료 (exit code {}). 마지막 출력:\n{}", scriptName, exitCode, lastLines);
        }
        return exitCode;
    }

    private List<String> parseEngineCommand(String command) {
        return Arrays.stream(command.trim().split("\\s+"))
                .filter(part -> !part.isBlank())
                .toList();
    }
}
