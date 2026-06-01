package com.smartadv.backend.controller;

import com.smartadv.backend.common.security.UserContext;
import com.smartadv.backend.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@RestController
@RequestMapping("/api/maintenance")
@RequiredArgsConstructor
public class MaintenanceController {

    private static final AtomicBoolean maintenanceMode = new AtomicBoolean(false);

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        return ResponseEntity.ok(Map.of("enabled", maintenanceMode.get()));
    }

    @PostMapping("/toggle")
    public ResponseEntity<?> toggle(@RequestParam(value = "enabled", required = false) Boolean enabled) {
        User currentUser = UserContext.getCurrentUser();
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not logged in."));
        }
        if (!"ADMIN".equals(currentUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only administrators can toggle maintenance mode."));
        }

        if (enabled != null) {
            maintenanceMode.set(enabled);
        } else {
            maintenanceMode.set(!maintenanceMode.get());
        }

        return ResponseEntity.ok(Map.of("enabled", maintenanceMode.get()));
    }

    public static boolean isMaintenanceActive() {
        return maintenanceMode.get();
    }
}
