import Foundation

// MARK: - API Configuration
struct APIConfig {
    static let baseURL = "http://localhost:8080/api" // Update for production
    static let timeout: TimeInterval = 30.0
}

// MARK: - API Error Types
enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(String)
    case serverError(Int, String)
    case networkError(String)
    case unauthorized
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received"
        case .decodingError(let message):
            return "Data parsing error: \(message)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .unauthorized:
            return "Unauthorized. Please log in again."
        }
    }
}

// MARK: - API Client
@MainActor
class APIClient: ObservableObject {
    static let shared = APIClient()
    
    private let session: URLSession
    private var authToken: String?
    
    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = APIConfig.timeout
        config.timeoutIntervalForResource = APIConfig.timeout
        self.session = URLSession(configuration: config)
        
        loadAuthToken()
    }
    
    // MARK: - Auth Token Management
    func setAuthToken(_ token: String) {
        self.authToken = token
        KeychainManager.shared.save(token, forKey: "auth_token")
    }
    
    func clearAuthToken() {
        self.authToken = nil
        KeychainManager.shared.delete(forKey: "auth_token")
    }
    
    private func loadAuthToken() {
        self.authToken = KeychainManager.shared.load(forKey: "auth_token")
    }
    
    var isAuthenticated: Bool {
        return authToken != nil
    }
    
    // MARK: - Request Builder
    private func createRequest(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil
    ) throws -> URLRequest {
        guard let url = URL(string: "\(APIConfig.baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        return request
    }
    
    // MARK: - Generic Request Method
    private func performRequest<T: Codable>(
        endpoint: String,
        method: String = "GET",
        body: Codable? = nil,
        responseType: T.Type
    ) async throws -> T {
        let bodyData: Data?
        if let body = body {
            bodyData = try JSONEncoder().encode(body)
        } else {
            bodyData = nil
        }
        
        let request = try createRequest(endpoint: endpoint, method: method, body: bodyData)
        
        do {
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.networkError("Invalid response")
            }
            
            if httpResponse.statusCode == 401 {
                clearAuthToken()
                throw APIError.unauthorized
            }
            
            if !(200...299).contains(httpResponse.statusCode) {
                let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw APIError.serverError(httpResponse.statusCode, errorMessage)
            }
            
            do {
                let decoder = JSONDecoder()
                return try decoder.decode(responseType, from: data)
            } catch {
                throw APIError.decodingError(error.localizedDescription)
            }
            
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error.localizedDescription)
        }
    }
    
    // MARK: - Authentication Methods
    func login(email: String, password: String) async throws -> AuthResponse {
        let request = AuthRequest(email: email, password: password)
        let response: AuthResponse = try await performRequest(
            endpoint: "/auth/login",
            method: "POST",
            body: request,
            responseType: AuthResponse.self
        )
        
        setAuthToken(response.token)
        return response
    }
    
    func register(email: String, password: String) async throws -> AuthResponse {
        let request = AuthRequest(email: email, password: password)
        let response: AuthResponse = try await performRequest(
            endpoint: "/auth/register",
            method: "POST",
            body: request,
            responseType: AuthResponse.self
        )
        
        setAuthToken(response.token)
        return response
    }
    
    func generatePairingCode() async throws -> String {
        let response: PairingCodeResponse = try await performRequest(
            endpoint: "/couples/generate-code",
            method: "POST",
            responseType: PairingCodeResponse.self
        )
        
        return response.code
    }
    
    func pairWithCode(_ code: String) async throws -> Couple {
        let request = PairWithCodeRequest(code: code)
        return try await performRequest(
            endpoint: "/couples/pair",
            method: "POST",
            body: request,
            responseType: Couple.self
        )
    }
    
    // MARK: - Love Moments Methods
    func getLoveMoments() async throws -> [LoveMoment] {
        return try await performRequest(
            endpoint: "/love-moments",
            method: "GET",
            responseType: [LoveMoment].self
        )
    }
    
    func createLoveMoment(_ moment: CreateLoveMomentRequest) async throws -> LoveMoment {
        return try await performRequest(
            endpoint: "/love-moments",
            method: "POST",
            body: moment,
            responseType: LoveMoment.self
        )
    }
    
    func deleteLoveMoment(id: Int) async throws {
        let _: [String: String] = try await performRequest(
            endpoint: "/love-moments/\(id)",
            method: "DELETE",
            responseType: [String: String].self
        )
    }
    
    // MARK: - Achievements Methods
    func getAchievements() async throws -> [Achievement] {
        return try await performRequest(
            endpoint: "/achievements",
            method: "GET",
            responseType: [Achievement].self
        )
    }
    
    // MARK: - Roleplay Methods
    func getRoleplayScripts() async throws -> [RoleplayScript] {
        return try await performRequest(
            endpoint: "/roleplay/scripts",
            method: "GET",
            responseType: [RoleplayScript].self
        )
    }
    
    func createRoleplayScript(_ script: RoleplayScript) async throws -> RoleplayScript {
        return try await performRequest(
            endpoint: "/roleplay/scripts",
            method: "POST",
            body: script,
            responseType: RoleplayScript.self
        )
    }
}

// MARK: - Keychain Manager
class KeychainManager {
    static let shared = KeychainManager()
    
    private init() {}
    
    func save(_ value: String, forKey key: String) {
        let data = Data(value.utf8)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
    
    func load(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)
        
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}