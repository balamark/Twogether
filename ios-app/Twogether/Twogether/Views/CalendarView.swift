import SwiftUI
import SwiftData

struct CalendarView: View {
    @EnvironmentObject var offlineManager: OfflineManager
    @Query private var loveMoments: [LocalLoveMoment]
    @Query private var couples: [LocalCouple]
    
    @State private var selectedDate = Date()
    @State private var currentMonth = Date()
    @State private var showingMomentDetail = false
    @State private var selectedMoments: [LocalLoveMoment] = []
    @State private var showingNewMomentForm = false
    @State private var animationOffset: CGSize = .zero
    
    private var currentCouple: LocalCouple? {
        couples.first { !$0.isDeleted }
    }
    
    private var currentMonthMoments: [LocalLoveMoment] {
        let calendar = Calendar.current
        return loveMoments.filter { moment in
            !moment.isDeleted &&
            calendar.isDate(moment.date, equalTo: currentMonth, toGranularity: .month) &&
            (currentCouple == nil || moment.coupleId == currentCouple?.id)
        }
    }
    
    private var selectedDateMoments: [LocalLoveMoment] {
        let calendar = Calendar.current
        return currentMonthMoments.filter { moment in
            calendar.isDate(moment.date, equalTo: selectedDate, toGranularity: .day)
        }.sorted { $0.date < $1.date }
    }
    
    private var momentsByDate: [Date: [LocalLoveMoment]] {
        let calendar = Calendar.current
        return Dictionary(grouping: currentMonthMoments) { moment in
            calendar.startOfDay(for: moment.date)
        }
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Calendar Header with Month Navigation
                VStack(spacing: 16) {
                    HStack {
                        Button(action: previousMonth) {
                            Image(systemName: "chevron.left")
                                .font(.title2)
                                .foregroundColor(.pink)
                        }
                        
                        Spacer()
                        
                        Text(currentMonth.formatted(.dateTime.month(.wide).year(.defaultDigits)))
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                        
                        Spacer()
                        
                        Button(action: nextMonth) {
                            Image(systemName: "chevron.right")
                                .font(.title2)
                                .foregroundColor(.pink)
                        }
                    }
                    .padding(.horizontal)
                    
                    // Calendar Grid
                    CalendarGridView(
                        currentMonth: currentMonth,
                        selectedDate: $selectedDate,
                        momentsByDate: momentsByDate,
                        onDateTapped: { date in
                            withAnimation(.easeInOut(duration: 0.3)) {
                                selectedDate = date
                            }
                        }
                    )
                    .padding(.horizontal)
                }
                .padding(.top)
                .background(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 1, x: 0, y: 1)
                
                // Selected Date Moments
                VStack(spacing: 0) {
                    // Date Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(selectedDate.formatted(.dateTime.weekday(.wide)))
                                .font(.title3)
                                .fontWeight(.semibold)
                                .foregroundColor(.pink)
                            
                            Text(selectedDate.formatted(.dateTime.month().day()))
                                .font(.headline)
                                .foregroundColor(.primary)
                        }
                        
                        Spacer()
                        
                        Button(action: { showingNewMomentForm = true }) {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                Text("Add Moment")
                            }
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                LinearGradient(
                                    gradient: Gradient(colors: [.pink, .purple]),
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(20)
                            .shadow(color: .pink.opacity(0.3), radius: 5, x: 0, y: 2)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 20)
                    .padding(.bottom, 16)
                    
                    Divider()
                    
                    // Moments List for Selected Date
                    if selectedDateMoments.isEmpty {
                        EmptyDayView(date: selectedDate) {
                            showingNewMomentForm = true
                        }
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(selectedDateMoments, id: \.id) { moment in
                                    CalendarMomentCard(moment: moment)
                                        .onTapGesture {
                                            selectedMoments = [moment]
                                            showingMomentDetail = true
                                        }
                                }
                            }
                            .padding()
                        }
                    }
                }
                
                // Offline indicator
                if !offlineManager.isOnline {
                    HStack {
                        Image(systemName: "wifi.slash")
                        Text("Working offline")
                        if offlineManager.unsyncedItemsCount > 0 {
                            Text("(\(offlineManager.unsyncedItemsCount) pending)")
                                .foregroundColor(.orange)
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.large)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        animationOffset = value.translation
                    }
                    .onEnded { value in
                        let threshold: CGFloat = 50
                        if abs(value.translation.width) > threshold {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                if value.translation.width > 0 {
                                    previousMonth()
                                } else {
                                    nextMonth()
                                }
                            }
                        }
                        animationOffset = .zero
                    }
            )
            .sheet(isPresented: $showingNewMomentForm) {
                LoveMomentFormView(
                    moment: nil,
                    isPresented: $showingNewMomentForm,
                    onSave: {}
                )
            }
            .sheet(isPresented: $showingMomentDetail) {
                if let moment = selectedMoments.first {
                    MomentDetailView(moment: moment, isPresented: $showingMomentDetail)
                }
            }
        }
    }
    
    private func previousMonth() {
        let calendar = Calendar.current
        if let newMonth = calendar.date(byAdding: .month, value: -1, to: currentMonth) {
            currentMonth = newMonth
        }
    }
    
    private func nextMonth() {
        let calendar = Calendar.current
        if let newMonth = calendar.date(byAdding: .month, value: 1, to: currentMonth) {
            currentMonth = newMonth
        }
    }
}

// MARK: - Calendar Grid View
struct CalendarGridView: View {
    let currentMonth: Date
    @Binding var selectedDate: Date
    let momentsByDate: [Date: [LocalLoveMoment]]
    let onDateTapped: (Date) -> Void
    
    private let calendar = Calendar.current
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter
    }()
    
    private var monthDates: [Date] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: currentMonth),
              let monthFirstWeek = calendar.dateInterval(of: .weekOfYear, for: monthInterval.start),
              let monthLastWeek = calendar.dateInterval(of: .weekOfYear, for: monthInterval.end - 1) else {
            return []
        }
        
        var dates: [Date] = []
        var date = monthFirstWeek.start
        
        while date <= monthLastWeek.end {
            dates.append(date)
            guard let nextDate = calendar.date(byAdding: .day, value: 1, to: date) else { break }
            date = nextDate
        }
        
        return dates
    }
    
    var body: some View {
        VStack(spacing: 8) {
            // Weekday headers
            HStack {
                ForEach(calendar.shortWeekdaySymbols, id: \.self) { weekday in
                    Text(weekday)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            
            // Calendar days
            let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
            
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(monthDates, id: \.self) { date in
                    CalendarDayView(
                        date: date,
                        currentMonth: currentMonth,
                        selectedDate: selectedDate,
                        moments: momentsByDate[calendar.startOfDay(for: date)] ?? [],
                        onTapped: onDateTapped
                    )
                }
            }
        }
    }
}

// MARK: - Calendar Day View
struct CalendarDayView: View {
    let date: Date
    let currentMonth: Date
    let selectedDate: Date
    let moments: [LocalLoveMoment]
    let onTapped: (Date) -> Void
    
    private let calendar = Calendar.current
    
    private var isToday: Bool {
        calendar.isDateInToday(date)
    }
    
    private var isSelected: Bool {
        calendar.isDate(date, equalTo: selectedDate, toGranularity: .day)
    }
    
    private var isInCurrentMonth: Bool {
        calendar.isDate(date, equalTo: currentMonth, toGranularity: .month)
    }
    
    private var dayText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter.string(from: date)
    }
    
    var body: some View {
        Button(action: { onTapped(date) }) {
            VStack(spacing: 4) {
                Text(dayText)
                    .font(.system(size: 16, weight: isSelected ? .bold : .medium))
                    .foregroundColor(dayColor)
                
                // Moment indicators
                HStack(spacing: 2) {
                    ForEach(0..<min(moments.count, 3), id: \.self) { index in
                        let moment = moments[index]
                        Circle()
                            .fill(moodColor(for: moment))
                            .frame(width: 6, height: 6)
                    }
                    
                    if moments.count > 3 {
                        Text("+\(moments.count - 3)")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.pink)
                    }
                }
                .frame(height: 10)
            }
            .frame(width: 40, height: 50)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(backgroundColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(borderColor, lineWidth: borderWidth)
                    )
            )
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private var dayColor: Color {
        if isSelected {
            return .white
        } else if isToday {
            return .pink
        } else if isInCurrentMonth {
            return .primary
        } else {
            return .secondary
        }
    }
    
    private var backgroundColor: Color {
        if isSelected {
            return .pink
        } else if isToday {
            return .pink.opacity(0.2)
        } else {
            return .clear
        }
    }
    
    private var borderColor: Color {
        if isToday && !isSelected {
            return .pink
        } else {
            return .clear
        }
    }
    
    private var borderWidth: CGFloat {
        isToday && !isSelected ? 1 : 0
    }
    
    private func moodColor(for moment: LocalLoveMoment) -> Color {
        guard let moodString = moment.mood,
              let mood = MoodType(rawValue: moodString) else {
            return .gray
        }
        return Color(mood.color)
    }
}

// MARK: - Calendar Moment Card
struct CalendarMomentCard: View {
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
        VStack(alignment: .leading, spacing: 12) {
            // Header with time and tags
            HStack {
                Text(moment.date.formatted(date: .omitted, time: .shortened))
                    .font(.headline)
                    .foregroundColor(.primary)
                
                Spacer()
                
                HStack(spacing: 6) {
                    if let mood = mood {
                        HStack(spacing: 3) {
                            Image(systemName: mood.icon)
                                .font(.caption)
                            Text(mood.displayName)
                                .font(.caption)
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(mood.color).opacity(0.2))
                        .foregroundColor(Color(mood.color))
                        .cornerRadius(6)
                    }
                    
                    if let activity = activity {
                        HStack(spacing: 3) {
                            Image(systemName: activity.icon)
                                .font(.caption)
                            Text(activity.displayName)
                                .font(.caption)
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(activity.color).opacity(0.2))
                        .foregroundColor(Color(activity.color))
                        .cornerRadius(6)
                    }
                }
            }
            
            // Description
            if let description = moment.desc, !description.isEmpty {
                Text(description)
                    .font(.body)
                    .foregroundColor(.primary)
                    .lineLimit(2)
            }
            
            // Details
            HStack {
                if let location = moment.location, !location.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "location")
                        Text(location)
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                
                if let duration = moment.duration {
                    HStack(spacing: 3) {
                        Image(systemName: "clock")
                        Text("\(duration) min")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if !moment.isSynced {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.pink.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Empty Day View
struct EmptyDayView: View {
    let date: Date
    let onAddMoment: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            VStack(spacing: 12) {
                Image(systemName: "heart.circle")
                    .font(.system(size: 50))
                    .foregroundColor(.gray.opacity(0.6))
                
                Text("No moments on \(date.formatted(.dateTime.month().day()))")
                    .font(.headline)
                    .foregroundColor(.primary)
                
                Text("Create your first moment for this day")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            
            Button(action: onAddMoment) {
                HStack {
                    Image(systemName: "plus")
                    Text("Add Moment")
                }
                .font(.headline)
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    LinearGradient(
                        gradient: Gradient(colors: [.pink, .purple]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(25)
                .shadow(color: .pink.opacity(0.3), radius: 10, x: 0, y: 5)
            }
            
            Spacer()
        }
        .padding()
    }
}

// MARK: - Moment Detail View
struct MomentDetailView: View {
    let moment: LocalLoveMoment
    @Binding var isPresented: Bool
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(moment.date.formatted(date: .complete, time: .shortened))
                            .font(.title2)
                            .fontWeight(.semibold)
                        
                        if let description = moment.desc {
                            Text(description)
                                .font(.body)
                                .foregroundColor(.primary)
                        }
                    }
                    
                    // Details cards would go here
                    // (mood, activity, location, duration, etc.)
                    
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Moment Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
        }
    }
}

#Preview {
    CalendarView()
        .environmentObject(OfflineManager.shared)
}