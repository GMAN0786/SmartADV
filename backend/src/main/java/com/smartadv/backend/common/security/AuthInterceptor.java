package com.smartadv.backend.common.security;

import com.smartadv.backend.domain.SessionToken;
import com.smartadv.backend.domain.User;
import com.smartadv.backend.repository.SessionTokenRepository;
import com.smartadv.backend.controller.MaintenanceController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final SessionTokenRepository sessionTokenRepository;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // OPTIONS preflight requests are allowed without authorization
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // Check if maintenance mode is active
        if (MaintenanceController.isMaintenanceActive()) {
            String authHeader = request.getHeader("Authorization");
            boolean isAdmin = false;
            
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                SessionToken sessionToken = sessionTokenRepository.findById(token).orElse(null);
                
                if (sessionToken == null || sessionToken.isExpired()) {
                    if (sessionToken != null) {
                        sessionTokenRepository.delete(sessionToken);
                    }
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"error\": \"Unauthorized\", \"message\": \"Session expired or invalid.\"}");
                    return false;
                }
                
                User user = sessionToken.getUser();
                if ("ADMIN".equals(user.getRole())) {
                    isAdmin = true;
                    UserContext.setCurrentUser(user);
                }
            }

            if (!isAdmin) {
                response.setStatus(HttpStatus.SERVICE_UNAVAILABLE.value());
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write("{\"error\": \"MaintenanceMode\", \"message\": \"Service is in maintenance.\"}");
                return false;
            }
            
            return true;
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.getWriter().write("{\"error\": \"Unauthorized: Missing session token.\"}");
            return false;
        }

        String token = authHeader.substring(7);
        SessionToken sessionToken = sessionTokenRepository.findById(token).orElse(null);

        if (sessionToken == null || sessionToken.isExpired()) {
            if (sessionToken != null) {
                sessionTokenRepository.delete(sessionToken); // Clean up expired token
            }
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.getWriter().write("{\"error\": \"Unauthorized: Session expired or invalid.\"}");
            return false;
        }

        UserContext.setCurrentUser(sessionToken.getUser());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        UserContext.clear();
    }
}
