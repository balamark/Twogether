import SwiftUI
import SwiftData

struct LoveMomentsView: View {
    @EnvironmentObject var offlineManager: OfflineManager
    @Query private var loveMoments: [LocalLoveMoment]
    @Query private var couples: [LocalCouple]
    @Query private var users: [LocalUser]
    
    @State private var showingForm = false
    @State private var selectedMoment: LocalLoveMoment?
    @State private var searchText = ""
    @State private var filterMood: MoodType?
    @State private var filterActivity: ActivityType?
    @State private var showingFilters = false
    
    private var currentCouple: LocalCouple? {
        couples.first { !$0.isDeleted }
    }
    
    private var currentUser: LocalUser? {
        users.first { !$0.isDeleted }
    }
    
    private var filteredMoments: [LocalLoveMoment] {
        var moments = loveMoments.filter { !$0.isDeleted }
        
        if let couple = currentCouple {
            moments = moments.filter { $0.coupleId == couple.id }
        }
        
        if !searchText.isEmpty {
            moments = moments.filter { moment in
                (moment.desc?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (moment.location?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
        
        if let mood = filterMood {
            moments = moments.filter { $0.mood == mood.rawValue }
        }
        
        if let activity = filterActivity {
            moments = moments.filter { $0.activityType == activity.rawValue }
        }
        
        return moments.sorted { $0.date > $1.date }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient inspired by Stitch designs
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(.systemBackground),
                        Color(.systemBackground).opacity(0.8),
                        Color.pink.opacity(0.05)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Modern search section with Stitch-inspired styling
                    VStack(spacing: 16) {
                        // Enhanced search bar with modern styling
                        HStack(spacing: 12) {
                            Image(systemName: "magnifyingglass")
                                .foregroundColor(.gray)
                                .font(.system(size: 18, weight: .medium))
                            
                            TextField("Search your moments...", text: $searchText)
                                .textFieldStyle(PlainTextFieldStyle())
                                .font(.system(size: 16, weight: .medium))
                            
                            if !searchText.isEmpty {
                                Button(action: { 
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        searchText = ""
                                    }
                                }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.gray)
                                        .font(.system(size: 16, weight: .medium))
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(.systemBackground))
                                .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(Color.gray.opacity(0.1), lineWidth: 1)
                                )
                        )
                        
                        // Enhanced filter chips with Stitch design
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ModernFilterChip(
                                    title: "All Moods",
                                    isSelected: filterMood == nil,
                                    action: { filterMood = nil }
                                )
                                
                                ForEach(MoodType.allCases, id: \.rawValue) { mood in
                                    ModernFilterChip(
                                        title: mood.displayName,
                                        icon: mood.icon,
                                        color: Color(mood.color),
                                        isSelected: filterMood == mood,
                                        action: { 
                                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                                filterMood = filterMood == mood ? nil : mood
                                            }
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ModernFilterChip(
                                    title: "All Types",
                                    isSelected: filterActivity == nil,
                                    action: { filterActivity = nil }
                                )
                                
                                ForEach(ActivityType.allCases, id: \.rawValue) { activity in
                                    ModernFilterChip(
                                        title: activity.displayName,
                                        icon: activity.icon,
                                        color: Color(activity.color),
                                        isSelected: filterActivity == activity,
                                        action: { 
                                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                                filterActivity = filterActivity == activity ? nil : activity
                                            }
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.vertical, 20)
                    .background(
                        Color(.systemBackground)
                            .shadow(color: .black.opacity(0.03), radius: 1, x: 0, y: 1)
                    )
                    
                    // Enhanced moments list with modern cards
                    if filteredMoments.isEmpty {
                        ModernEmptyMomentsView(hasSearch: !searchText.isEmpty || filterMood != nil || filterActivity != nil)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(filteredMoments, id: \.id) { moment in
                                    ModernLoveMomentCard(moment: moment)
                                        .onTapGesture {
                                            selectedMoment = moment
                                            showingForm = true
                                        }
                                        .contextMenu {
                                            Button(action: {
                                                selectedMoment = moment
                                                showingForm = true
                                            }) {
                                                Label("Edit", systemImage: "pencil")
                                            }
                                            
                                            Button(action: {
                                                deleteMoment(moment)
                                            }) {
                                                Label("Delete", systemImage: "trash")
                                            }
                                        }
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                            .padding(.bottom, 100)
                        }
                    }
                    
                    // Modern offline indicator
                    if !offlineManager.isOnline {
                        HStack(spacing: 8) {
                            Image(systemName: "wifi.slash")
                                .font(.system(size: 14, weight: .medium))
                            Text("Working offline")
                                .font(.system(size: 14, weight: .medium))
                            if offlineManager.unsyncedItemsCount > 0 {
                                Text("(\(offlineManager.unsyncedItemsCount) pending)")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.orange)
                            }
                        }
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(Color.orange.opacity(0.1))
                        )
                        .padding(.bottom, 8)
                    }
                }
            }
            .navigationTitle("Love Moments")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingForm = true }) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        gradient: Gradient(colors: [.pink, .purple]),
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 44, height: 44)
                                .shadow(color: .pink.opacity(0.3), radius: 8, x: 0, y: 4)
                            
                            Image(systemName: "plus")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .sheet(isPresented: $showingForm) {
                LoveMomentFormView(
                    moment: selectedMoment,
                    isPresented: $showingForm,
                    onSave: { selectedMoment = nil }
                )
            }
            .onChange(of: showingForm) { oldValue, newValue in
                if !newValue {
                    selectedMoment = nil
                }
            }
        }
    }
    
    private func deleteMoment(_ moment: LocalLoveMoment) {
        Task {
            await offlineManager.deleteLoveMoment(moment)
        }
    }
}

// MARK: - Modern Filter Chip Component (Stitch-inspired)
struct ModernFilterChip: View {
    let title: String
    let icon: String?
    let color: Color
    let isSelected: Bool
    let action: () -> Void
    
    init(title: String, icon: String? = nil, color: Color = .gray, isSelected: Bool, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.color = color
        self.isSelected = isSelected
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                Group {
                    if isSelected {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [color.opacity(0.8), color]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .shadow(color: color.opacity(0.3), radius: 6, x: 0, y: 2)
                    } else {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color(.systemBackground))
                            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 1)
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                            )
                    }
                }
            )
            .foregroundColor(isSelected ? .white : .primary)
            .scaleEffect(isSelected ? 1.05 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Modern Love Moment Card Component (Stitch-inspired)
struct ModernLoveMomentCard: View {
    let moment: LocalLoveMoment
    
    private var mood: MoodType? {
        guard let moodString = moment.mood else { return nil }
        return MoodType(rawValue: moodString)
    }
    
    private var activity: ActivityType? {
        guard let activityString = moment.activityType else { return nil }
        return ActivityType(rawValue: activityString)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header with enhanced date styling
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(moment.date.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.primary)
                    
                    Text(moment.date.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                // Modern badges with enhanced styling
                VStack(alignment: .trailing, spacing: 8) {
                    if let mood = mood {
                        ModernBadge(
                            text: mood.displayName,
                            icon: mood.icon,
                            color: Color(mood.color)
                        )
                    }
                    
                    if let activity = activity {
                        ModernBadge(
                            text: activity.displayName,
                            icon: activity.icon,
                            color: Color(activity.color)
                        )
                    }
                }
            }
            
            // Enhanced description styling
            if let description = moment.desc, !description.isEmpty {
                Text(description)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(.primary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }
            
            // Enhanced metadata section
            HStack(spacing: 16) {
                if let location = moment.location, !location.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "location.fill")
                            .font(.system(size: 12, weight: .medium))
                        Text(location)
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.secondary)
                }
                
                if let duration = moment.duration {
                    HStack(spacing: 6) {
                        Image(systemName: "clock.fill")
                            .font(.system(size: 12, weight: .medium))
                        Text("\(duration) min")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if !moment.isSynced {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 12, weight: .medium))
                        Text("Syncing")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.orange.opacity(0.1))
                    )
                }
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.06), radius: 10, x: 0, y: 4)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color.gray.opacity(0.1),
                                    Color.clear
                                ]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
    }
}

// MARK: - Modern Badge Component
struct ModernBadge: View {
    let text: String
    let icon: String
    let color: Color
    
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .bold))
            Text(text)
                .font(.system(size: 12, weight: .bold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(
                    LinearGradient(
                        gradient: Gradient(colors: [color.opacity(0.8), color]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: color.opacity(0.3), radius: 4, x: 0, y: 2)
        )
        .foregroundColor(.white)
    }
}

// MARK: - Modern Empty State Component (Stitch-inspired)
struct ModernEmptyMomentsView: View {
    let hasSearch: Bool
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            VStack(spacing: 24) {
                // Enhanced icon with gradient background
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
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: hasSearch ? "magnifyingglass" : "heart.fill")
                        .font(.system(size: 40, weight: .medium))
                        .foregroundStyle(
                            LinearGradient(
                                gradient: Gradient(colors: [.pink, .purple]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
                
                VStack(spacing: 12) {
                    Text(hasSearch ? "No moments found" : "Your love story starts here")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.center)
                    
                    Text(hasSearch ? "Try adjusting your search or filters to find your moments" : "Create your first beautiful memory together and watch your love story unfold")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .lineLimit(3)
                }
            }
            
            if !hasSearch {
                Button(action: {}) {
                    HStack(spacing: 10) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 18, weight: .bold))
                        Text("Create First Moment")
                            .font(.system(size: 18, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 25)
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [.pink, .purple]),
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .shadow(color: .pink.opacity(0.4), radius: 12, x: 0, y: 6)
                    )
                }
                .scaleEffect(1.0)
                .animation(.easeInOut(duration: 0.1), value: false)
            }
            
            Spacer()
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Legacy Components (for backward compatibility)
struct FilterChip: View {
    let title: String
    let icon: String?
    let color: Color
    let isSelected: Bool
    let action: () -> Void
    
    init(title: String, icon: String? = nil, color: Color = .gray, isSelected: Bool, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.color = color
        self.isSelected = isSelected
        self.action = action
    }
    
    var body: some View {
        ModernFilterChip(title: title, icon: icon, color: color, isSelected: isSelected, action: action)
    }
}

struct LoveMomentRow: View {
    let moment: LocalLoveMoment
    
    var body: some View {
        ModernLoveMomentCard(moment: moment)
    }
}

struct EmptyMomentsView: View {
    let hasSearch: Bool
    
    var body: some View {
        ModernEmptyMomentsView(hasSearch: hasSearch)
    }
}

#Preview {
    LoveMomentsView()
        .environmentObject(OfflineManager.shared)
}