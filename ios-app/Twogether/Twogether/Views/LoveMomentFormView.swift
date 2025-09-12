import SwiftUI
import SwiftData
import PhotosUI

struct LoveMomentFormView: View {
    @EnvironmentObject var offlineManager: OfflineManager
    @Query private var couples: [LocalCouple]
    @Query private var users: [LocalUser]
    
    let moment: LocalLoveMoment?
    @Binding var isPresented: Bool
    let onSave: () -> Void
    
    @State private var date = Date()
    @State private var description = ""
    @State private var location = ""
    @State private var duration = ""
    @State private var selectedMood: MoodType?
    @State private var selectedActivity: ActivityType?
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showingPhotoPicker = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    
    private var isEditing: Bool {
        moment != nil
    }
    
    private var currentCouple: LocalCouple? {
        couples.first { !$0.isDeleted }
    }
    
    private var currentUser: LocalUser? {
        users.first { !$0.isDeleted }
    }
    
    private var isFormValid: Bool {
        !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Date Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "When", icon: "calendar")
                        
                        DatePicker(
                            "Date & Time",
                            selection: $date,
                            in: ...Date(),
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .datePickerStyle(.compact)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                    
                    // Description Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "What happened", icon: "text.bubble")
                        
                        TextEditor(text: $description)
                            .frame(minHeight: 100)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(description.isEmpty ? Color.gray.opacity(0.3) : Color.pink.opacity(0.5), lineWidth: 1)
                            )
                    }
                    
                    // Mood Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "How did you feel", icon: "heart")
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(MoodType.allCases, id: \.rawValue) { mood in
                                    MoodSelectionCard(
                                        mood: mood,
                                        isSelected: selectedMood == mood,
                                        action: { 
                                            selectedMood = selectedMood == mood ? nil : mood
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    
                    // Activity Type Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "Activity type", icon: "star")
                        
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                            ForEach(ActivityType.allCases, id: \.rawValue) { activity in
                                ActivitySelectionCard(
                                    activity: activity,
                                    isSelected: selectedActivity == activity,
                                    action: {
                                        selectedActivity = selectedActivity == activity ? nil : activity
                                    }
                                )
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    // Details Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "Details", icon: "info.circle")
                        
                        VStack(spacing: 16) {
                            // Location
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "location")
                                        .foregroundColor(.pink)
                                    Text("Location")
                                        .font(.headline)
                                }
                                
                                TextField("Where did this happen?", text: $location)
                                    .textFieldStyle(.roundedBorder)
                            }
                            
                            // Duration
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "clock")
                                        .foregroundColor(.pink)
                                    Text("Duration (minutes)")
                                        .font(.headline)
                                }
                                
                                TextField("How long did it last?", text: $duration)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.numberPad)
                            }
                        }
                    }
                    
                    // Photos Section (placeholder for now)
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(title: "Photos", icon: "photo")
                        
                        Button(action: { showingPhotoPicker = true }) {
                            HStack {
                                Image(systemName: "camera")
                                Text("Add Photos")
                            }
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.pink.opacity(0.8))
                            .cornerRadius(12)
                        }
                        .disabled(true) // Will enable in Phase 4
                        .opacity(0.6)
                        
                        Text("Photo capture coming soon")
                            .font(.caption)
                            .foregroundColor(.gray)
                            .padding(.horizontal)
                    }
                    
                    // Error message
                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .foregroundColor(.red)
                            .padding()
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(8)
                    }
                    
                    Spacer(minLength: 100) // Space for floating button
                }
                .padding()
            }
            .navigationTitle(isEditing ? "Edit Moment" : "New Moment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(isEditing ? "Update" : "Save") {
                        saveMoment()
                    }
                    .disabled(!isFormValid || isLoading)
                    .fontWeight(.semibold)
                }
            }
            .overlay(
                // Loading overlay
                Group {
                    if isLoading {
                        Color.black.opacity(0.3)
                            .ignoresSafeArea()
                        
                        VStack {
                            ProgressView()
                                .scaleEffect(1.2)
                            Text(isEditing ? "Updating..." : "Saving...")
                                .padding(.top, 8)
                                .foregroundColor(.white)
                        }
                        .padding()
                        .background(Color.black.opacity(0.7))
                        .cornerRadius(12)
                    }
                }
            )
        }
        .onAppear {
            loadMomentData()
        }
        .photosPicker(
            isPresented: $showingPhotoPicker,
            selection: $selectedPhotos,
            maxSelectionCount: 5,
            matching: .images
        )
    }
    
    private func loadMomentData() {
        guard let moment = moment else { return }
        
        date = moment.date
        description = moment.desc ?? ""
        location = moment.location ?? ""
        duration = moment.duration.map(String.init) ?? ""
        
        if let moodString = moment.mood {
            selectedMood = MoodType(rawValue: moodString)
        }
        
        if let activityString = moment.activityType {
            selectedActivity = ActivityType(rawValue: activityString)
        }
    }
    
    private func saveMoment() {
        guard isFormValid,
              let couple = currentCouple,
              let user = currentUser else { return }
        
        isLoading = true
        errorMessage = ""
        
        Task {
            do {
                let durationInt = Int(duration.trimmingCharacters(in: .whitespacesAndNewlines))
                
                if let existingMoment = moment {
                    // Update existing moment
                    existingMoment.date = date
                    existingMoment.desc = description.trimmingCharacters(in: .whitespacesAndNewlines)
                    existingMoment.location = location.isEmpty ? nil : location.trimmingCharacters(in: .whitespacesAndNewlines)
                    existingMoment.duration = durationInt
                    existingMoment.mood = selectedMood?.rawValue
                    existingMoment.activityType = selectedActivity?.rawValue
                    existingMoment.updatedAt = Date()
                    existingMoment.isSynced = false
                    
                    await offlineManager.updateLoveMoment(existingMoment)
                } else {
                    // Create new moment
                    let newMoment = LocalLoveMoment(
                        id: Int.random(in: 1000...99999),
                        coupleId: couple.id,
                        userId: user.id,
                        date: date,
                        desc: description.trimmingCharacters(in: .whitespacesAndNewlines),
                        duration: durationInt,
                        mood: selectedMood?.rawValue,
                        location: location.isEmpty ? nil : location.trimmingCharacters(in: .whitespacesAndNewlines),
                        activityType: selectedActivity?.rawValue
                    )
                    
                    await offlineManager.createLoveMoment(newMoment)
                }
                
                await MainActor.run {
                    isLoading = false
                    onSave()
                    isPresented = false
                }
                
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = "Failed to save moment: \(error.localizedDescription)"
                }
            }
        }
    }
}

// MARK: - Section Header Component
struct SectionHeader: View {
    let title: String
    let icon: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.pink)
                .font(.title2)
            
            Text(title)
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            Spacer()
        }
    }
}

// MARK: - Mood Selection Card
struct MoodSelectionCard: View {
    let mood: MoodType
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: mood.icon)
                    .font(.title2)
                    .foregroundColor(isSelected ? Color(mood.color) : .gray)
                
                Text(mood.displayName)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(isSelected ? Color(mood.color) : .gray)
            }
            .frame(width: 80, height: 80)
            .background(
                isSelected ? Color(mood.color).opacity(0.2) : Color(.systemGray6)
            )
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isSelected ? Color(mood.color) : Color.gray.opacity(0.3),
                        lineWidth: isSelected ? 2 : 1
                    )
            )
            .scaleEffect(isSelected ? 1.05 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Activity Selection Card
struct ActivitySelectionCard: View {
    let activity: ActivityType
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: activity.icon)
                    .font(.title3)
                    .foregroundColor(isSelected ? Color(activity.color) : .gray)
                    .frame(width: 24)
                
                Text(activity.displayName)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundColor(isSelected ? Color(activity.color) : .primary)
                
                Spacer()
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(activity.color))
                }
            }
            .padding()
            .background(
                isSelected ? Color(activity.color).opacity(0.2) : Color(.systemGray6)
            )
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isSelected ? Color(activity.color) : Color.gray.opacity(0.3),
                        lineWidth: isSelected ? 2 : 1
                    )
            )
            .scaleEffect(isSelected ? 1.02 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    LoveMomentFormView(
        moment: nil,
        isPresented: .constant(true),
        onSave: {}
    )
    .environmentObject(OfflineManager.shared)
}