package com.smartadv.backend.service;

import com.smartadv.backend.domain.AnalysisJob;
import com.smartadv.backend.domain.Video;
import com.smartadv.backend.repository.AnalysisJobRepository;
import com.smartadv.backend.repository.VideoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class VideoService {

    private final StorageService storageService;
    private final VideoRepository videoRepository;
    private final AnalysisJobRepository analysisJobRepository;
    private final WorkerClientService workerClientService;

    @Transactional
    public Video uploadVideo(MultipartFile file, Long userId, String clipMode) {
        // 1. S3 (Mock)에 파일 업로드
        String storedUrl = storageService.uploadFile(file);

        // 2. DB에 파일 정보 저장
        Video video = Video.builder()
                .originalFileName(file.getOriginalFilename())
                .s3Url(storedUrl)
                .fileSize(file.getSize())
                .userId(userId)
                .build();
        video = videoRepository.save(video);
        
        // 3. 작업(Job) 생성 및 파이프라인 트리거
        AnalysisJob job = AnalysisJob.builder()
                .videoId(video.getId())
                .userId(userId)
                .clipMode(clipMode)
                .build();
        final AnalysisJob savedJob = analysisJobRepository.save(job);
        final Long savedVideoId = video.getId();
        
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        workerClientService.executeMockPipeline(savedVideoId, savedJob);
                    }
                }
            );
        } else {
            workerClientService.executeMockPipeline(savedVideoId, savedJob);
        }
        
        return video;
    }

    @Transactional
    public Video uploadYoutubeVideo(String youtubeUrl, Long userId, String clipMode) {
        // 1. DB에 파일 정보 저장 (S3 URL 대신 유튜브 URL을 저장)
        Video video = Video.builder()
                .originalFileName("YouTube Video")
                .s3Url("youtube:" + youtubeUrl)
                .fileSize(0L)
                .userId(userId)
                .build();
        video = videoRepository.save(video);
        
        // 2. 작업(Job) 생성 및 파이프라인 트리거
        AnalysisJob job = AnalysisJob.builder()
                .videoId(video.getId())
                .userId(userId)
                .clipMode(clipMode)
                .build();
        final AnalysisJob savedJob = analysisJobRepository.save(job);
        final Long savedVideoId = video.getId();
        
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        workerClientService.executeMockPipeline(savedVideoId, savedJob);
                    }
                }
            );
        } else {
            workerClientService.executeMockPipeline(savedVideoId, savedJob);
        }
        
        return video;
    }
}
