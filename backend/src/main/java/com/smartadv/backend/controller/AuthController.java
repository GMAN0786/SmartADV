package com.smartadv.backend.controller;

import com.smartadv.backend.common.security.UserContext;
import com.smartadv.backend.domain.SessionToken;
import com.smartadv.backend.domain.User;
import com.smartadv.backend.repository.SessionTokenRepository;
import com.smartadv.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final SessionTokenRepository sessionTokenRepository;

    @Value("${smartadv.security.admin-emails:}")
    private String adminEmails;

    @Value("${smartadv.security.google.client-id}")
    private String googleClientId;

    public record GoogleLoginRequest(String credential) {}

    @PostMapping("/google")
    public ResponseEntity<?> loginWithGoogle(@RequestBody GoogleLoginRequest request) {
        String idToken = request.credential();
        if (idToken == null || idToken.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing google credential token."));
        }

        try {
            // Local OIDC Validation using GoogleIdTokenVerifier
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idTokenObj = verifier.verify(idToken);
            if (idTokenObj == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid Google Token."));
            }

            GoogleIdToken.Payload payload = idTokenObj.getPayload();
            String googleSub = payload.getSubject();
            String email = payload.getEmail();
            String name = (String) payload.get("name");
            String picture = (String) payload.get("picture");

            if (googleSub == null || email == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Incomplete Google Token payload."));
            }

            // Determine user role based on environment variable config
            String role = "USER";
            if (adminEmails != null && !adminEmails.isBlank()) {
                String[] emails = adminEmails.split(",");
                for (String adminEmail : emails) {
                    if (adminEmail.trim().equalsIgnoreCase(email)) {
                        role = "ADMIN";
                        break;
                    }
                }
            }

            final String finalRole = role;
            User user = userRepository.findByGoogleSub(googleSub)
                    .orElseGet(() -> userRepository.save(User.builder()
                            .googleSub(googleSub)
                            .email(email)
                            .name(name)
                            .picture(picture)
                            .role(finalRole)
                            .build()));

            user.updateProfile(name, picture);
            user.updateRole(finalRole);
            userRepository.save(user);

            // Generate session token valid for 7 days
            String token = UUID.randomUUID().toString();
            SessionToken sessionToken = SessionToken.builder()
                    .token(token)
                    .user(user)
                    .expiresAt(LocalDateTime.now().plusDays(7))
                    .build();
            sessionTokenRepository.save(sessionToken);

            Map<String, Object> response = new HashMap<>();
            response.put("token", token);
            response.put("user", Map.of(
                    "id", user.getId(),
                    "email", user.getEmail(),
                    "name", user.getName(),
                    "picture", user.getPicture() != null ? user.getPicture() : "",
                    "role", user.getRole()
            ));

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Google Token verification failed: " + e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser() {
        User user = UserContext.getCurrentUser();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not logged in."));
        }
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "name", user.getName(),
                "picture", user.getPicture() != null ? user.getPicture() : "",
                "role", user.getRole()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            sessionTokenRepository.deleteById(token);
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully."));
    }
}
