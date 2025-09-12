import Foundation
import SwiftData

// MARK: - Core Data Models for Offline-First Architecture

@Model
class LocalUser {
    @Attribute(.unique) var id: Int
    var email: String
    var serverId: Int
    var createdAt: Date
    var updatedAt: Date
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, email: String, serverId: Int = 0, createdAt: Date = Date(), updatedAt: Date = Date(), isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.email = email
        self.serverId = serverId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class LocalCouple {
    @Attribute(.unique) var id: Int
    var user1Id: Int
    var user2Id: Int
    var serverId: Int
    var createdAt: Date
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, user1Id: Int, user2Id: Int, serverId: Int = 0, createdAt: Date = Date(), isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.user1Id = user1Id
        self.user2Id = user2Id
        self.serverId = serverId
        self.createdAt = createdAt
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class LocalLoveMoment {
    @Attribute(.unique) var id: Int
    var coupleId: Int
    var userId: Int
    var date: Date
    var desc: String?
    var duration: Int?
    var mood: String?
    var location: String?
    var activityType: String?
    var serverId: Int
    var createdAt: Date
    var updatedAt: Date
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, coupleId: Int, userId: Int, date: Date, desc: String? = nil, duration: Int? = nil, mood: String? = nil, location: String? = nil, activityType: String? = nil, serverId: Int = 0, createdAt: Date = Date(), updatedAt: Date = Date(), isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.coupleId = coupleId
        self.userId = userId
        self.date = date
        self.desc = desc
        self.duration = duration
        self.mood = mood
        self.location = location
        self.activityType = activityType
        self.serverId = serverId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class LocalPhoto {
    @Attribute(.unique) var id: Int
    var loveMomentId: Int
    var filename: String
    var url: String?
    var localURL: String?
    var caption: String?
    var serverId: Int
    var createdAt: Date
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, loveMomentId: Int, filename: String, url: String? = nil, localURL: String? = nil, caption: String? = nil, serverId: Int = 0, createdAt: Date = Date(), isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.loveMomentId = loveMomentId
        self.filename = filename
        self.url = url
        self.localURL = localURL
        self.caption = caption
        self.serverId = serverId
        self.createdAt = createdAt
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class LocalAchievement {
    @Attribute(.unique) var id: Int
    var coupleId: Int
    var achievementType: String
    var earnedAt: Date
    var desc: String?
    var serverId: Int
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, coupleId: Int, achievementType: String, earnedAt: Date, desc: String? = nil, serverId: Int = 0, isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.coupleId = coupleId
        self.achievementType = achievementType
        self.earnedAt = earnedAt
        self.desc = desc
        self.serverId = serverId
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class LocalRoleplayScript {
    @Attribute(.unique) var id: Int
    var title: String
    var content: String
    var category: String
    var difficulty: String?
    var duration: Int?
    var serverId: Int
    var createdAt: Date
    var updatedAt: Date
    var isSynced: Bool
    var isDeleted: Bool
    
    init(id: Int = 0, title: String, content: String, category: String, difficulty: String? = nil, duration: Int? = nil, serverId: Int = 0, createdAt: Date = Date(), updatedAt: Date = Date(), isSynced: Bool = false, isDeleted: Bool = false) {
        self.id = id
        self.title = title
        self.content = content
        self.category = category
        self.difficulty = difficulty
        self.duration = duration
        self.serverId = serverId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isSynced = isSynced
        self.isDeleted = isDeleted
    }
}

@Model
class SyncQueue {
    @Attribute(.unique) var id: Int
    var action: String // CREATE, UPDATE, DELETE
    var endpoint: String
    var data: String?
    var retryCount: Int
    var createdAt: Date
    
    init(id: Int = 0, action: String, endpoint: String, data: String? = nil, retryCount: Int = 0, createdAt: Date = Date()) {
        self.id = id
        self.action = action
        self.endpoint = endpoint
        self.data = data
        self.retryCount = retryCount
        self.createdAt = createdAt
    }
}

// MARK: - API Response Models (matching your Rust backend)

struct AuthResponse: Codable {
    let token: String
    let user: User
    let couple: Couple?
}

struct User: Codable, Identifiable {
    let id: Int
    let email: String
    let createdAt: String
    let updatedAt: String
    
    enum CodingKeys: String, CodingKey {
        case id, email
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct Couple: Codable, Identifiable {
    let id: Int
    let user1Id: Int
    let user2Id: Int
    let createdAt: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case user1Id = "user1_id"
        case user2Id = "user2_id"
        case createdAt = "created_at"
    }
}

struct LoveMoment: Codable, Identifiable {
    let id: Int
    let coupleId: Int
    let userId: Int
    let date: String
    let description: String?
    let duration: Int?
    let mood: String?
    let location: String?
    let activityType: String?
    let createdAt: String
    let updatedAt: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case coupleId = "couple_id"
        case userId = "user_id"
        case date, description, duration, mood, location
        case activityType = "activity_type"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct Achievement: Codable, Identifiable {
    let id: Int
    let coupleId: Int
    let achievementType: String
    let earnedAt: String
    let description: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case coupleId = "couple_id"
        case achievementType = "achievement_type"
        case earnedAt = "earned_at"
        case description
    }
}

struct RoleplayScript: Codable, Identifiable {
    let id: Int
    let title: String
    let content: String
    let category: String
    let difficulty: String?
    let duration: Int?
    let createdAt: String
    let updatedAt: String
    
    enum CodingKeys: String, CodingKey {
        case id, title, content, category, difficulty, duration
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Request Models

struct AuthRequest: Codable {
    let email: String
    let password: String
}

struct CreateLoveMomentRequest: Codable {
    let date: String
    let description: String?
    let duration: Int?
    let mood: String?
    let location: String?
    let activityType: String?
    
    enum CodingKeys: String, CodingKey {
        case date, description, duration, mood, location
        case activityType = "activity_type"
    }
}

struct PairingCodeResponse: Codable {
    let code: String
}

struct PairWithCodeRequest: Codable {
    let code: String
}

// MARK: - UI Enums

enum ActivityType: String, CaseIterable {
    case romantic = "romantic"
    case intimate = "intimate"
    case date = "date"
    case adventure = "adventure"
    case relaxing = "relaxing"
    case playful = "playful"
    case emotional = "emotional"
    case other = "other"
    
    var displayName: String {
        switch self {
        case .romantic: return "Romantic"
        case .intimate: return "Intimate"
        case .date: return "Date"
        case .adventure: return "Adventure"
        case .relaxing: return "Relaxing"
        case .playful: return "Playful"
        case .emotional: return "Emotional"
        case .other: return "Other"
        }
    }
    
    var icon: String {
        switch self {
        case .romantic: return "heart"
        case .intimate: return "heart.circle"
        case .date: return "calendar"
        case .adventure: return "mountain.2"
        case .relaxing: return "leaf"
        case .playful: return "gamecontroller"
        case .emotional: return "bubble.left.and.bubble.right"
        case .other: return "ellipsis.circle"
        }
    }
    
    var color: String {
        switch self {
        case .romantic: return "pink"
        case .intimate: return "red"
        case .date: return "blue"
        case .adventure: return "orange"
        case .relaxing: return "green"
        case .playful: return "purple"
        case .emotional: return "indigo"
        case .other: return "gray"
        }
    }
}

enum MoodType: String, CaseIterable {
    case amazing = "amazing"
    case happy = "happy"
    case content = "content"
    case romantic = "romantic"
    case passionate = "passionate"
    case playful = "playful"
    case peaceful = "peaceful"
    case excited = "excited"
    
    var displayName: String {
        return rawValue.capitalized
    }
    
    var icon: String {
        switch self {
        case .amazing: return "star.circle.fill"
        case .happy: return "smiley.fill"
        case .content: return "heart.circle.fill"
        case .romantic: return "heart.fill"
        case .passionate: return "flame.fill"
        case .playful: return "gamecontroller.fill"
        case .peaceful: return "leaf.circle.fill"
        case .excited: return "exclamationmark.circle.fill"
        }
    }
    
    var color: String {
        switch self {
        case .amazing: return "yellow"
        case .happy: return "orange"
        case .content: return "green"
        case .romantic: return "pink"
        case .passionate: return "red"
        case .playful: return "purple"
        case .peaceful: return "blue"
        case .excited: return "yellow"
        }
    }
}