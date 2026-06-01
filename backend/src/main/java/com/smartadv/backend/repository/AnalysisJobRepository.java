package com.smartadv.backend.repository;

import com.smartadv.backend.domain.AnalysisJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, Long> {
    Optional<AnalysisJob> findByVideoId(Long videoId);
    Optional<AnalysisJob> findFirstByUserIdAndStatusOrderByFinishedAtDesc(Long userId, String status);
    Optional<AnalysisJob> findFirstByOrderByStartedAtDesc();

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(j) FROM AnalysisJob j WHERE j.id < :jobId AND j.status IN ('PENDING', 'PREPROCESSING', 'SCRIPT_GENERATING', 'TTS_GENERATING', 'MERGING')")
    long countActiveJobsBefore(@org.springframework.data.repository.query.Param("jobId") Long jobId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(j) FROM AnalysisJob j WHERE j.status IN ('PENDING', 'PREPROCESSING', 'SCRIPT_GENERATING', 'TTS_GENERATING', 'MERGING')")
    long countAllActiveJobs();
}
