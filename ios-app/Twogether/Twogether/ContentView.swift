//
//  ContentView.swift
//  Twogether
//
//  Created by Ting-An Wang on 7/27/25.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @EnvironmentObject var offlineManager: OfflineManager
    @EnvironmentObject var apiClient: APIClient
    @Query private var users: [LocalUser]
    @Query private var couples: [LocalCouple]
    
    @State private var isAuthenticated = false
    @State private var needsPairing = false
    @State private var currentUser: LocalUser?
    @State private var currentCouple: LocalCouple?
    
    var body: some View {
        Group {
            if !isAuthenticated {
                AuthenticationView(
                    isAuthenticated: $isAuthenticated,
                    needsPairing: $needsPairing,
                    currentUser: $currentUser
                )
            } else if needsPairing {
                PairingView(
                    needsPairing: $needsPairing,
                    currentCouple: $currentCouple
                )
            } else {
                MainTabView()
            }
        }
        .onAppear {
            checkAuthenticationStatus()
        }
        .onChange(of: users) {
            checkAuthenticationStatus()
        }
        .onChange(of: couples) {
            checkPairingStatus()
        }
    }
    
    private func checkAuthenticationStatus() {
        if let user = users.first {
            currentUser = user
            isAuthenticated = true
            checkPairingStatus()
        } else {
            isAuthenticated = false
            needsPairing = false
        }
    }
    
    private func checkPairingStatus() {
        if let couple = couples.first {
            currentCouple = couple
            needsPairing = false
        } else {
            needsPairing = isAuthenticated
        }
    }
}

// MARK: - Authentication View (Priority 1 - Enhanced with Stitch Design)
struct AuthenticationView: View {
    @Binding var isAuthenticated: Bool
    @Binding var needsPairing: Bool
    @Binding var currentUser: LocalUser?
    
    @EnvironmentObject var offlineManager: OfflineManager
    @State private var isLogin = true
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                // Stitch-inspired background gradient
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(.systemBackground),
                        Color.pink.opacity(0.03),
                        Color.purple.opacity(0.05)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 40) {
                        // Enhanced Logo Section with Stitch design
                        VStack(spacing: 20) {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            gradient: Gradient(colors: [
                                                Color.pink.opacity(0.1),
                                                Color.purple.opacity(0.1)
                                            ]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 140, height: 140)
                                    .shadow(color: .pink.opacity(0.2), radius: 20, x: 0, y: 10)
                                
                                Image(systemName: "heart.circle.fill")
                                    .foregroundStyle(
                                        LinearGradient(
                                            gradient: Gradient(colors: [.pink, .purple]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .font(.system(size: 60, weight: .medium))
                            }
                            
                            VStack(spacing: 8) {
                                Text("Together")
                                    .font(.system(size: 32, weight: .bold))
                                    .foregroundColor(.primary)
                                
                                Text(isLogin ? "Welcome back to your love story" : "Begin your beautiful journey together")
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 32)
                            }
                        }
                        .padding(.top, 40)
                        
                        // Enhanced Form Section with Stitch design
                        VStack(spacing: 24) {
                            // Email Field with modern styling
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Email Address")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.primary)
                                
                                TextField("Enter your email", text: $email)
                                    .textFieldStyle(PlainTextFieldStyle())
                                    .font(.system(size: 16, weight: .medium))
                                    .keyboardType(.emailAddress)
                                    .autocapitalization(.none)
                                    .autocorrectionDisabled()
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 16)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16)
                                            .fill(Color(.systemBackground))
                                            .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 2)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 16)
                                                    .stroke(Color.gray.opacity(0.1), lineWidth: 1)
                                            )
                                    )
                            }
                            
                            // Password Field with modern styling
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Password")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.primary)
                                
                                SecureField("Enter your password", text: $password)
                                    .textFieldStyle(PlainTextFieldStyle())
                                    .font(.system(size: 16, weight: .medium))
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 16)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16)
                                            .fill(Color(.systemBackground))
                                            .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 2)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 16)
                                                    .stroke(Color.gray.opacity(0.1), lineWidth: 1)
                                            )
                                    )
                            }
                            
                            // Confirm Password (Registration only) with modern styling
                            if !isLogin {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Confirm Password")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.primary)
                                    
                                    SecureField("Confirm your password", text: $confirmPassword)
                                        .textFieldStyle(PlainTextFieldStyle())
                                        .font(.system(size: 16, weight: .medium))
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 16)
                                        .background(
                                            RoundedRectangle(cornerRadius: 16)
                                                .fill(Color(.systemBackground))
                                                .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 2)
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 16)
                                                        .stroke(Color.gray.opacity(0.1), lineWidth: 1)
                                                )
                                        )
                                }
                                .transition(.move(edge: .top).combined(with: .opacity))
                            }
                        }
                        .padding(.horizontal, 24)
                        
                        // Enhanced Offline Status Indicator
                        if !offlineManager.isOnline {
                            HStack(spacing: 10) {
                                Image(systemName: "wifi.slash")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Working offline - will sync when connected")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .foregroundColor(.orange)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.orange.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                                    )
                            )
                            .padding(.horizontal, 24)
                        }
                        
                        // Enhanced Error Message
                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.system(size: 14, weight: .medium))
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(Color.red.opacity(0.1))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(Color.red.opacity(0.2), lineWidth: 1)
                                        )
                                )
                                .padding(.horizontal, 24)
                        }
                        
                        // Enhanced Action Button with Stitch design
                        Button(action: handleAuthentication) {
                            HStack(spacing: 12) {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        .scaleEffect(0.9)
                                }
                                
                                Text(isLogin ? "Sign In" : "Create Account")
                                    .font(.system(size: 18, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(
                                        LinearGradient(
                                            gradient: Gradient(colors: [.pink, .purple]),
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .shadow(color: .pink.opacity(0.4), radius: 12, x: 0, y: 6)
                            )
                            .foregroundColor(.white)
                            .scaleEffect(isFormValid ? 1.0 : 0.95)
                            .opacity(isFormValid ? 1.0 : 0.6)
                        }
                        .disabled(isLoading || !isFormValid)
                        .padding(.horizontal, 24)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isFormValid)
                        
                        // Enhanced Toggle Mode Button
                        Button(action: toggleMode) {
                            HStack(spacing: 6) {
                                Text(isLogin ? "Don't have an account?" : "Already have an account?")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 16, weight: .medium))
                                Text(isLogin ? "Sign Up" : "Sign In")
                                    .foregroundStyle(
                                        LinearGradient(
                                            gradient: Gradient(colors: [.pink, .purple]),
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .padding(.vertical, 16)
                        }
                        
                        Spacer(minLength: 40)
                    }
                }
            }
            .navigationBarHidden(true)
        }
    }
    
    private var isFormValid: Bool {
        if isLogin {
            return !email.isEmpty && !password.isEmpty && email.contains("@")
        } else {
            return !email.isEmpty && !password.isEmpty && !confirmPassword.isEmpty &&
                   email.contains("@") && password.count >= 6 && password == confirmPassword
        }
    }
    
    private func toggleMode() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isLogin.toggle()
            errorMessage = ""
            password = ""
            confirmPassword = ""
        }
    }
    
    private func handleAuthentication() {
        errorMessage = ""
        
        guard isFormValid else {
            errorMessage = isLogin ? 
                "Please enter valid email and password" : 
                "Please fill all fields correctly (password 6+ chars, passwords match)"
            return
        }
        
        isLoading = true
        
        Task {
            do {
                let user = try await offlineManager.authenticateOffline(
                    email: email,
                    password: password,
                    isRegistering: !isLogin
                )
                
                await MainActor.run {
                    currentUser = user
                    isAuthenticated = true
                    isLoading = false
                }
                
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Pairing View (Priority 1 - Enhanced with Stitch Design)
struct PairingView: View {
    @Binding var needsPairing: Bool
    @Binding var currentCouple: LocalCouple?
    
    @EnvironmentObject var offlineManager: OfflineManager
    @State private var pairingCode = ""
    @State private var generatedCode = ""
    @State private var isGenerating = false
    @State private var isPairing = false
    @State private var errorMessage = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                // Stitch-inspired background gradient
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(.systemBackground),
                        Color.blue.opacity(0.03),
                        Color.pink.opacity(0.05)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 40) {
                        // Enhanced Header Section with Stitch design
                        VStack(spacing: 20) {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            gradient: Gradient(colors: [
                                                Color.blue.opacity(0.1),
                                                Color.pink.opacity(0.1)
                                            ]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 120, height: 120)
                                    .shadow(color: .blue.opacity(0.2), radius: 16, x: 0, y: 8)
                                
                                Image(systemName: "person.2.circle.fill")
                                    .foregroundStyle(
                                        LinearGradient(
                                            gradient: Gradient(colors: [.blue, .pink]),
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .font(.system(size: 50, weight: .medium))
                            }
                            
                            VStack(spacing: 8) {
                                Text("Connect with Your Partner")
                                    .font(.system(size: 28, weight: .bold))
                                    .multilineTextAlignment(.center)
                                    .foregroundColor(.primary)
                                
                                Text("Share a pairing code to link your accounts together and begin your journey")
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 24)
                            }
                        }
                        .padding(.top, 40)
                        
                        // Enhanced Offline Status
                        if !offlineManager.isOnline {
                            HStack(spacing: 10) {
                                Image(systemName: "wifi.slash")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Offline - pairing will sync when connected")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .foregroundColor(.orange)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.orange.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                                    )
                            )
                            .padding(.horizontal, 24)
                        }
                        
                        VStack(spacing: 40) {
                            // Enhanced Generate Code Section with Stitch design
                            VStack(spacing: 20) {
                                Text("Option 1: Generate Code")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(.primary)
                                
                                Button(action: generateCode) {
                                    HStack(spacing: 12) {
                                        if isGenerating {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                                .scaleEffect(0.9)
                                        }
                                        
                                        Text("Generate Pairing Code")
                                            .font(.system(size: 18, weight: .bold))
                                    }
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 56)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16)
                                            .fill(
                                                LinearGradient(
                                                    gradient: Gradient(colors: [.blue, .cyan]),
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                )
                                            )
                                            .shadow(color: .blue.opacity(0.4), radius: 12, x: 0, y: 6)
                                    )
                                    .foregroundColor(.white)
                                    .scaleEffect(isGenerating ? 0.95 : 1.0)
                                }
                                .disabled(isGenerating)
                                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isGenerating)
                                
                                if !generatedCode.isEmpty {
                                    VStack(spacing: 16) {
                                        Text("Your Pairing Code:")
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundColor(.secondary)
                                        
                                        Text(generatedCode)
                                            .font(.system(size: 32, weight: .bold))
                                            .foregroundStyle(
                                                LinearGradient(
                                                    gradient: Gradient(colors: [.blue, .cyan]),
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                )
                                            )
                                            .padding(.vertical, 20)
                                            .padding(.horizontal, 32)
                                            .background(
                                                RoundedRectangle(cornerRadius: 16)
                                                    .fill(Color.blue.opacity(0.1))
                                                    .overlay(
                                                        RoundedRectangle(cornerRadius: 16)
                                                            .stroke(
                                                                LinearGradient(
                                                                    gradient: Gradient(colors: [.blue.opacity(0.3), .cyan.opacity(0.3)]),
                                                                    startPoint: .topLeading,
                                                                    endPoint: .bottomTrailing
                                                                ),
                                                                lineWidth: 2
                                                            )
                                                    )
                                            )
                                            .onTapGesture {
                                                // Copy to clipboard
                                                UIPasteboard.general.string = generatedCode
                                            }
                                        
                                        Text("Tap to copy • Share with your partner")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(.secondary)
                                    }
                                    .transition(.move(edge: .top).combined(with: .opacity))
                                }
                            }
                            
                            // Divider
                            HStack {
                                Rectangle()
                                    .frame(height: 1)
                                    .foregroundColor(.gray.opacity(0.3))
                                
                                Text("OR")
                                    .font(.headline)
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 16)
                                
                                Rectangle()
                                    .frame(height: 1)
                                    .foregroundColor(.gray.opacity(0.3))
                            }
                            
                            // Enter Code Section
                            VStack(spacing: 16) {
                                Text("Option 2: Enter Partner's Code")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Pairing Code")
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    
                                    TextField("Enter 8-character code", text: $pairingCode)
                                        .textFieldStyle(.roundedBorder)
                                        .autocapitalization(.allCharacters)
                                        .autocorrectionDisabled()
                                        .frame(minHeight: 50) // Touch-friendly
                                        .onChange(of: pairingCode) { _, newValue in
                                            // Format as uppercase and limit to 8 chars
                                            let formatted = String(newValue.uppercased().prefix(8))
                                            if formatted != pairingCode {
                                                pairingCode = formatted
                                            }
                                        }
                                }
                                
                                Button(action: pairWithCode) {
                                    HStack(spacing: 12) {
                                        if isPairing {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        }
                                        
                                        Text("Connect")
                                            .font(.title3)
                                            .fontWeight(.semibold)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 56) // Touch-friendly
                                    .background(pairingCode.count == 8 ? Color.pink : Color.gray)
                                    .foregroundColor(.white)
                                    .cornerRadius(16)
                                    .shadow(color: pairingCode.count == 8 ? .pink.opacity(0.3) : .clear, radius: 6, y: 3)
                                }
                                .disabled(pairingCode.count != 8 || isPairing)
                            }
                        }
                        .padding(.horizontal, 24)
                        
                        // Error Message
                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.body)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        
                        // Skip Button (for testing)
                        Button("Skip for now") {
                            needsPairing = false
                        }
                        .font(.body)
                        .foregroundColor(.secondary)
                        .padding(.vertical, 12)
                        
                        Spacer(minLength: 32)
                    }
                }
            }
            .navigationTitle("Pairing")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    private func generateCode() {
        isGenerating = true
        errorMessage = ""
        
        Task {
            do {
                let code = try await offlineManager.generatePairingCodeOffline()
                
                await MainActor.run {
                    generatedCode = code
                    isGenerating = false
                }
                
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isGenerating = false
                }
            }
        }
    }
    
    private func pairWithCode() {
        isPairing = true
        errorMessage = ""
        
        Task {
            do {
                let couple = try await offlineManager.pairWithCodeOffline(pairingCode)
                
                await MainActor.run {
                    currentCouple = couple
                    needsPairing = false
                    isPairing = false
                }
                
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isPairing = false
                }
            }
        }
    }
}

// MARK: - Main Tab View (After Authentication & Pairing)
struct MainTabView: View {
    @EnvironmentObject var offlineManager: OfflineManager
    
    var body: some View {
        TabView {
            LoveMomentsView()
                .tabItem {
                    Image(systemName: "heart.fill")
                    Text("Moments")
                }
            
            CalendarView()
                .tabItem {
                    Image(systemName: "calendar")
                    Text("Calendar")
                }
            
            RoleplayView()
                .tabItem {
                    Image(systemName: "theatermasks.fill")
                    Text("Roleplay")
                }
            
            SettingsView()
                .tabItem {
                    Image(systemName: "gear")
                    Text("Settings")
                }
        }
        .accentColor(.pink)
    }
}

// MARK: - Placeholder Views for Priority 3+ Features
// Note: LoveMomentsView and CalendarView are now implemented in separate files

struct RoleplayView: View {
    var body: some View {
        NavigationView {
            Text("Roleplay - Priority 3")
                .navigationTitle("Roleplay")
        }
    }
}

struct SettingsView: View {
    var body: some View {
        NavigationView {
            Text("Settings - Coming Soon")
                .navigationTitle("Settings")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(OfflineManager.shared)
        .environmentObject(APIClient.shared)
}
