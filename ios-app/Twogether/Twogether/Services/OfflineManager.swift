import Foundation
import SwiftData
import Network

// MARK: - Offline-First Data Manager
@MainActor
class OfflineManager: ObservableObject {
    static let shared = OfflineManager()
    
    let modelContainer: ModelContainer
    private let apiClient = APIClient.shared
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "NetworkMonitor")
    
    @Published var isOnline = true
    @Published var isSyncing = false
    @Published var syncProgress: Double = 0.0
    @Published var unsyncedItemsCount = 0
    
    private init() {
        // Initialize SwiftData container
        do {
            self.modelContainer = try ModelContainer(for: 
                LocalUser.self,
                LocalCouple.self,
                LocalLoveMoment.self,
                LocalPhoto.self,
                LocalAchievement.self,
                LocalRoleplayScript.self,
                SyncQueue.self
            )
        } catch {
            fatalError("Failed to initialize model container: \(error)")
        }
        
        startNetworkMonitoring()
        updateUnsyncedCount()
    }
    
    var modelContext: ModelContext {
        return modelContainer.mainContext
    }
    
    // MARK: - Network Monitoring
    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                let wasOffline = !(self?.isOnline ?? true)
                self?.isOnline = path.status == .satisfied
                
                // Trigger sync when coming back online
                if wasOffline && self?.isOnline == true {
                    await self?.performFullSync()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }
    
    // MARK: - Authentication Management
    func authenticateOffline(email: String, password: String, isRegistering: Bool) async throws -> LocalUser {
        if isOnline && apiClient.isAuthenticated {
            // Try online authentication first
            do {
                let response = isRegistering ? 
                    try await apiClient.register(email: email, password: password) :
                    try await apiClient.login(email: email, password: password)
                
                // Save user locally
                let localUser = LocalUser(
                    id: Int.random(in: 1000...9999),
                    email: response.user.email,
                    serverId: response.user.id,
                    isSynced: true
                )
                
                modelContext.insert(localUser)
                
                // Save couple if exists
                if let couple = response.couple {
                    let localCouple = LocalCouple(
                        id: Int.random(in: 1000...9999),
                        user1Id: couple.user1Id,
                        user2Id: couple.user2Id,
                        serverId: couple.id,
                        isSynced: true
                    )
                    modelContext.insert(localCouple)
                }
                
                try modelContext.save()
                return localUser
                
            } catch {
                // Fall back to offline mode
                return try createOfflineUser(email: email, password: password)
            }
        } else {
            // Create user offline
            return try createOfflineUser(email: email, password: password)
        }
    }
    
    private func createOfflineUser(email: String, password: String) throws -> LocalUser {
        // Create user locally (will sync when online)
        let localUser = LocalUser(
            id: Int.random(in: 1000...9999),
            email: email,
            serverId: 0, // Will be updated when synced
            isSynced: false
        )
        
        modelContext.insert(localUser)
        
        // Queue for sync
        let syncData = try JSONEncoder().encode(AuthRequest(email: email, password: password))
        let syncItem = SyncQueue(
            id: Int.random(in: 1000...9999),
            action: "CREATE_USER",
            endpoint: "/auth/register",
            data: String(data: syncData, encoding: .utf8)
        )
        modelContext.insert(syncItem)
        
        try modelContext.save()
        updateUnsyncedCount()
        
        return localUser
    }
    
    // MARK: - Love Moments Offline CRUD
    func createLoveMomentOffline(
        date: Date,
        description: String?,
        duration: Int?,
        mood: String?,
        location: String?,
        activityType: String?
    ) async throws -> LocalLoveMoment {
        
        let moment = LocalLoveMoment(
            id: Int.random(in: 1000...9999),
            coupleId: getCurrentCoupleId(),
            userId: getCurrentUserId(),
            date: date,
            desc: description,
            duration: duration,
            mood: mood,
            location: location,
            activityType: activityType,
            serverId: 0,
            isSynced: false
        )
        
        modelContext.insert(moment)
        
        // Try immediate sync if online
        if isOnline && apiClient.isAuthenticated {
            do {
                let request = CreateLoveMomentRequest(
                    date: ISO8601DateFormatter().string(from: date),
                    description: description,
                    duration: duration,
                    mood: mood,
                    location: location,
                    activityType: activityType
                )
                
                let apiMoment = try await apiClient.createLoveMoment(request)
                
                // Update with server ID
                moment.serverId = apiMoment.id
                moment.isSynced = true
                
            } catch {
                // Queue for later sync
                queueMomentForSync(moment)
            }
        } else {
            // Queue for sync when online
            queueMomentForSync(moment)
        }
        
        try modelContext.save()
        updateUnsyncedCount()
        
        return moment
    }
    
    private func queueMomentForSync(_ moment: LocalLoveMoment) {
        let request = CreateLoveMomentRequest(
            date: ISO8601DateFormatter().string(from: moment.date),
            description: moment.desc,
            duration: moment.duration,
            mood: moment.mood,
            location: moment.location,
            activityType: moment.activityType
        )
        
        if let syncData = try? JSONEncoder().encode(request) {
            let syncItem = SyncQueue(
                id: Int.random(in: 1000...9999),
                action: "CREATE",
                endpoint: "/love-moments",
                data: String(data: syncData, encoding: .utf8)
            )
            modelContext.insert(syncItem)
        }
    }
    
    func updateLoveMomentOffline(_ moment: LocalLoveMoment) async throws {
        moment.updatedAt = Date()
        moment.isSynced = false
        
        // Try immediate sync if online
        if isOnline && apiClient.isAuthenticated && moment.serverId > 0 {
            // Queue for update sync
            queueMomentForSync(moment)
        }
        
        try modelContext.save()
        updateUnsyncedCount()
    }
    
    func deleteLoveMomentOffline(_ moment: LocalLoveMoment) async throws {
        if moment.serverId > 0 {
            // Mark as deleted for sync
            moment.isDeleted = true
            moment.isSynced = false
            
            // Queue deletion
            let syncItem = SyncQueue(
                id: Int.random(in: 1000...9999),
                action: "DELETE",
                endpoint: "/love-moments/\(moment.serverId)"
            )
            modelContext.insert(syncItem)
        } else {
            // Delete locally only
            modelContext.delete(moment)
        }
        
        try modelContext.save()
        updateUnsyncedCount()
    }
    
    // MARK: - Couple Pairing Offline
    func generatePairingCodeOffline() async throws -> String {
        if isOnline && apiClient.isAuthenticated {
            return try await apiClient.generatePairingCode()
        } else {
            // Generate local code (will sync when online)
            let code = String(Int.random(in: 10000000...99999999))
            
            let syncItem = SyncQueue(
                id: Int.random(in: 1000...9999),
                action: "GENERATE_CODE",
                endpoint: "/couples/generate-code",
                data: code
            )
            modelContext.insert(syncItem)
            
            try modelContext.save()
            updateUnsyncedCount()
            
            return code
        }
    }
    
    func pairWithCodeOffline(_ code: String) async throws -> LocalCouple {
        if isOnline && apiClient.isAuthenticated {
            let couple = try await apiClient.pairWithCode(code)
            
            let localCouple = LocalCouple(
                id: Int.random(in: 1000...9999),
                user1Id: couple.user1Id,
                user2Id: couple.user2Id,
                serverId: couple.id,
                isSynced: true
            )
            
            modelContext.insert(localCouple)
            try modelContext.save()
            
            return localCouple
        } else {
            // Create local pairing (will sync when online)
            let localCouple = LocalCouple(
                id: Int.random(in: 1000...9999),
                user1Id: getCurrentUserId(),
                user2Id: 0, // Will be updated when synced
                serverId: 0,
                isSynced: false
            )
            
            modelContext.insert(localCouple)
            
            let syncData = try JSONEncoder().encode(PairWithCodeRequest(code: code))
            let syncItem = SyncQueue(
                id: Int.random(in: 1000...9999),
                action: "PAIR",
                endpoint: "/couples/pair",
                data: String(data: syncData, encoding: .utf8)
            )
            modelContext.insert(syncItem)
            
            try modelContext.save()
            updateUnsyncedCount()
            
            return localCouple
        }
    }
    
    // MARK: - Full Sync Process
    func performFullSync() async {
        guard !isSyncing else { return }
        guard isOnline && apiClient.isAuthenticated else { return }
        
        isSyncing = true
        syncProgress = 0.0
        
        do {
            // Step 1: Process sync queue (25%)
            await processSyncQueue()
            syncProgress = 0.25
            
            // Step 2: Download server data (50%)
            await downloadServerData()
            syncProgress = 0.5
            
            // Step 3: Upload unsynced items (75%)
            await uploadUnsyncedItems()
            syncProgress = 0.75
            
            // Step 4: Cleanup (100%)
            await cleanupSyncedItems()
            syncProgress = 1.0
            
            updateUnsyncedCount()
            
        } catch {
            print("Sync error: \(error)")
        }
        
        isSyncing = false
    }
    
    private func processSyncQueue() async {
        let descriptor = FetchDescriptor<SyncQueue>(
            sortBy: [SortDescriptor(\.createdAt)]
        )
        
        do {
            let syncItems = try modelContext.fetch(descriptor)
            
            for syncItem in syncItems {
                await processSyncItem(syncItem)
            }
        } catch {
            print("Error processing sync queue: \(error)")
        }
    }
    
    private func processSyncItem(_ syncItem: SyncQueue) async {
        do {
            switch syncItem.action {
            case "CREATE":
                if let data = syncItem.data?.data(using: .utf8) {
                    let request = try JSONDecoder().decode(CreateLoveMomentRequest.self, from: data)
                    let _ = try await apiClient.createLoveMoment(request)
                }
                
            case "DELETE":
                if let idString = syncItem.endpoint.split(separator: "/").last,
                   let id = Int(idString) {
                    try await apiClient.deleteLoveMoment(id: id)
                }
                
            case "CREATE_USER":
                if let data = syncItem.data?.data(using: .utf8) {
                    let request = try JSONDecoder().decode(AuthRequest.self, from: data)
                    let _ = try await apiClient.register(email: request.email, password: request.password)
                }
                
            case "PAIR":
                if let data = syncItem.data?.data(using: .utf8) {
                    let request = try JSONDecoder().decode(PairWithCodeRequest.self, from: data)
                    let _ = try await apiClient.pairWithCode(request.code)
                }
                
            case "GENERATE_CODE":
                let _ = try await apiClient.generatePairingCode()
                
            default:
                break
            }
            
            // Remove successful sync item
            modelContext.delete(syncItem)
            
        } catch {
            // Increment retry count
            syncItem.retryCount += 1
            
            if syncItem.retryCount >= 3 {
                modelContext.delete(syncItem)
            }
        }
    }
    
    private func downloadServerData() async {
        do {
            // Download love moments
            let apiMoments = try await apiClient.getLoveMoments()
            await updateLocalMoments(apiMoments)
            
            // Download achievements
            let apiAchievements = try await apiClient.getAchievements()
            await updateLocalAchievements(apiAchievements)
            
        } catch {
            print("Error downloading server data: \(error)")
        }
    }
    
    private func updateLocalMoments(_ apiMoments: [LoveMoment]) async {
        for apiMoment in apiMoments {
            // Check if moment already exists locally
            let descriptor = FetchDescriptor<LocalLoveMoment>(
                predicate: #Predicate { $0.serverId == apiMoment.id }
            )
            
            do {
                let existingMoments = try modelContext.fetch(descriptor)
                
                if existingMoments.isEmpty {
                    // Create new local moment
                    let localMoment = LocalLoveMoment(
                        id: Int.random(in: 1000...9999),
                        coupleId: apiMoment.coupleId,
                        userId: apiMoment.userId,
                        date: ISO8601DateFormatter().date(from: apiMoment.date) ?? Date(),
                        desc: apiMoment.description,
                        duration: apiMoment.duration,
                        mood: apiMoment.mood,
                        location: apiMoment.location,
                        activityType: apiMoment.activityType,
                        serverId: apiMoment.id,
                        createdAt: ISO8601DateFormatter().date(from: apiMoment.createdAt) ?? Date(),
                        updatedAt: ISO8601DateFormatter().date(from: apiMoment.updatedAt) ?? Date(),
                        isSynced: true
                    )
                    
                    modelContext.insert(localMoment)
                }
            } catch {
                print("Error updating local moments: \(error)")
            }
        }
        
        try? modelContext.save()
    }
    
    private func updateLocalAchievements(_ apiAchievements: [Achievement]) async {
        for apiAchievement in apiAchievements {
            let descriptor = FetchDescriptor<LocalAchievement>(
                predicate: #Predicate { $0.serverId == apiAchievement.id }
            )
            
            do {
                let existing = try modelContext.fetch(descriptor)
                
                if existing.isEmpty {
                    let localAchievement = LocalAchievement(
                        id: Int.random(in: 1000...9999),
                        coupleId: apiAchievement.coupleId,
                        achievementType: apiAchievement.achievementType,
                        earnedAt: ISO8601DateFormatter().date(from: apiAchievement.earnedAt) ?? Date(),
                        desc: apiAchievement.description,
                        serverId: apiAchievement.id,
                        isSynced: true
                    )
                    
                    modelContext.insert(localAchievement)
                }
            } catch {
                print("Error updating achievements: \(error)")
            }
        }
        
        try? modelContext.save()
    }
    
    private func uploadUnsyncedItems() async {
        // Upload unsynced love moments
        let unsyncedDescriptor = FetchDescriptor<LocalLoveMoment>(
            predicate: #Predicate { $0.isSynced == false && $0.isDeleted == false && $0.serverId == 0 }
        )
        
        do {
            let unsyncedMoments = try modelContext.fetch(unsyncedDescriptor)
            
            for moment in unsyncedMoments {
                do {
                    let request = CreateLoveMomentRequest(
                        date: ISO8601DateFormatter().string(from: moment.date),
                        description: moment.desc,
                        duration: moment.duration,
                        mood: moment.mood,
                        location: moment.location,
                        activityType: moment.activityType
                    )
                    
                    let apiMoment = try await apiClient.createLoveMoment(request)
                    
                    moment.serverId = apiMoment.id
                    moment.isSynced = true
                    
                } catch {
                    print("Error uploading moment: \(error)")
                }
            }
            
            try modelContext.save()
            
        } catch {
            print("Error fetching unsynced moments: \(error)")
        }
    }
    
    private func cleanupSyncedItems() async {
        // Remove successfully synced queue items
        let syncedDescriptor = FetchDescriptor<SyncQueue>()
        
        do {
            let syncItems = try modelContext.fetch(syncedDescriptor)
            
            for item in syncItems {
                if item.retryCount >= 3 {
                    modelContext.delete(item)
                }
            }
            
            try modelContext.save()
        } catch {
            print("Error cleaning up sync items: \(error)")
        }
    }
    
    // MARK: - Public CRUD Methods
    
    func createLoveMoment(_ moment: LocalLoveMoment) async {
        modelContext.insert(moment)
        
        do {
            try modelContext.save()
            updateUnsyncedCount()
            
            // Queue for sync if online
            if isOnline {
                await queueMomentForSync(moment)
            }
        } catch {
            print("Error creating love moment: \(error)")
        }
    }
    
    func updateLoveMoment(_ moment: LocalLoveMoment) async {
        moment.isSynced = false
        moment.updatedAt = Date()
        
        do {
            try modelContext.save()
            updateUnsyncedCount()
            
            // Queue for sync if online
            if isOnline {
                await queueMomentForSync(moment)
            }
        } catch {
            print("Error updating love moment: \(error)")
        }
    }
    
    func deleteLoveMoment(_ moment: LocalLoveMoment) async {
        moment.isDeleted = true
        moment.isSynced = false
        
        do {
            try modelContext.save()
            updateUnsyncedCount()
            
            // Queue for sync if online and has server ID
            if isOnline && moment.serverId > 0 {
                let syncItem = SyncQueue(
                    id: Int.random(in: 1000...9999),
                    action: "DELETE",
                    endpoint: "love-moments/\(moment.serverId)",
                    data: nil
                )
                modelContext.insert(syncItem)
                try modelContext.save()
            }
        } catch {
            print("Error deleting love moment: \(error)")
        }
    }

    // MARK: - Helper Methods
    private func getCurrentUserId() -> Int {
        // Get current user ID from stored data
        let descriptor = FetchDescriptor<LocalUser>()
        
        do {
            let users = try modelContext.fetch(descriptor)
            return users.first?.id ?? 0
        } catch {
            return 0
        }
    }
    
    private func getCurrentCoupleId() -> Int {
        // Get current couple ID from stored data
        let descriptor = FetchDescriptor<LocalCouple>()
        
        do {
            let couples = try modelContext.fetch(descriptor)
            return couples.first?.id ?? 0
        } catch {
            return 0
        }
    }
    
    func updateUnsyncedCount() {
        do {
            let momentDescriptor = FetchDescriptor<LocalLoveMoment>(
                predicate: #Predicate { $0.isSynced == false }
            )
            let unsyncedMoments = try modelContext.fetch(momentDescriptor).count
            
            let queueDescriptor = FetchDescriptor<SyncQueue>()
            let queueItems = try modelContext.fetch(queueDescriptor).count
            
            unsyncedItemsCount = unsyncedMoments + queueItems
            
        } catch {
            unsyncedItemsCount = 0
        }
    }
    
    func hasUnsyncedChanges() -> Bool {
        return unsyncedItemsCount > 0
    }
    
    deinit {
        networkMonitor.cancel()
    }
}