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
    
    private var currentCouple: LocalCouple? {
        couples.first { !$0.isDeleted }
    }

    private var activeMoments: [LocalLoveMoment] {
        loveMoments.filter { moment in
            !moment.isDeleted &&
            (currentCouple == nil || moment.coupleId == currentCouple?.id)
        }
    }
    
    private var currentMonthMoments: [LocalLoveMoment] {
        let calendar = Calendar.current
        return activeMoments.filter { moment in
            calendar.isDate(moment.date, equalTo: currentMonth, toGranularity: .month)
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

    private var totalMoments: Int {
        activeMoments.count
    }

    private var thisMonthCount: Int {
        currentMonthMoments.count
    }

    private var streaks: (current: Int, longest: Int) {
        let calendar = Calendar.current
        let uniqueDays = Set(activeMoments.map { calendar.startOfDay(for: $0.date) }).sorted()
        
        var longest = 0
        var current = 0
        var previous: Date?
        
        for day in uniqueDays {
            if let prev = previous, calendar.dateComponents([.day], from: prev, to: day).day == 1 {
                current += 1
            } else {
                current = 1
            }
            longest = max(longest, current)
            previous = day
        }
        
        return (current, longest)
    }
    
    var body: some View {
        NavigationView {
            ZStack(alignment: .bottomTrailing) {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 24) {
                        headerHero
                        statsGrid
                        calendarCard
                        dayMomentsCard
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 100)
                }
                
                // Floating action
                Button(action: { showingNewMomentForm = true }) {
                    HStack(spacing: 10) {
                        Image(systemName: "plus")
                            .font(.headline)
                        Text("記錄親密時光")
                            .fontWeight(.semibold)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.pink, .purple]),
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                    .shadow(color: .pink.opacity(0.25), radius: 14, x: 0, y: 8)
                }
                .padding(.trailing, 24)
                .padding(.bottom, 24)
            }
            .navigationTitle("親密日曆")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingNewMomentForm) {
                LoveMomentFormView(
                    moment: nil,
                    isPresented: $showingNewMomentForm,
                    initialDate: selectedDate,
                    onSave: {}
                )
            }
            .sheet(isPresented: $showingMomentDetail) {
                if let moment = selectedMoments.first {
                    MomentDetailView(moment: moment, isPresented: $showingMomentDetail)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !offlineManager.isOnline {
                    HStack {
                        Image(systemName: "wifi.slash")
                        Text("離線模式")
                        if offlineManager.unsyncedItemsCount > 0 {
                            Text("(\(offlineManager.unsyncedItemsCount) 待同步)")
                                .foregroundColor(.orange)
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(.thinMaterial)
                }
            }
        }
    }
    
    private var headerHero: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Intimacy Calendar")
                        .font(.headline)
                        .foregroundColor(.white.opacity(0.8))
                    Text("記錄彼此的親密節奏，\n用日曆留下甜蜜軌跡。")
                        .font(.title2).bold()
                        .foregroundColor(.white)
                        .lineLimit(2)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 12) {
                    statPill(icon: "flame.fill", value: "\(streaks.current)x", label: "連續天數")
                    statPill(icon: "calendar", value: "\(thisMonthCount)", label: "本月記錄")
                }
            }
            
            HStack(spacing: 12) {
                quickChip(icon: "sparkles", title: "添加記錄") {
                    showingNewMomentForm = true
                }
                quickChip(icon: "clock", title: selectedDate.formatted(.dateTime.month().day())) {
                    withAnimation(.spring()) {
                        selectedDate = Date()
                        currentMonth = Date()
                    }
                }
            }
        }
        .padding(20)
        .background(
            LinearGradient(
                colors: [Color.pink.opacity(0.9), Color.purple.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .cornerRadius(24)
        .shadow(color: .pink.opacity(0.25), radius: 20, x: 0, y: 10)
    }

    private var statsGrid: some View {
        let cards: [(String, String, String, Color)] = [
            ("heart.fill", "總記錄", "\(totalMoments) 次", Color.pink.opacity(0.2)),
            ("sun.max.fill", "本月", "\(thisMonthCount) 次", Color.orange.opacity(0.2)),
            ("flame.fill", "連續", "\(streaks.current) 天", Color.red.opacity(0.2)),
            ("bolt.heart.fill", "最佳連勝", "\(streaks.longest) 天", Color.purple.opacity(0.2))
        ]
        
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2), spacing: 12) {
            ForEach(cards, id: \.0) { icon, title, value, color in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: icon)
                            .foregroundColor(.pink)
                        Text(title)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Text(value)
                        .font(.title3).bold()
                        .foregroundColor(.primary)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(color)
                .cornerRadius(14)
            }
        }
    }

    private var calendarCard: some View {
        VStack(spacing: 16) {
            HStack {
                Button(action: previousMonth) {
                    Image(systemName: "chevron.left")
                        .font(.title3)
                        .foregroundColor(.pink)
                        .padding(8)
                        .background(Color.pink.opacity(0.1))
                        .clipShape(Circle())
                }
                
                Spacer()
                
                VStack(spacing: 4) {
                    Text(currentMonth.formatted(.dateTime.year(.defaultDigits)))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text(currentMonth.formatted(.dateTime.month(.wide)))
                        .font(.title2).bold()
                        .foregroundColor(.primary)
                }
                
                Spacer()
                
                Button(action: nextMonth) {
                    Image(systemName: "chevron.right")
                        .font(.title3)
                        .foregroundColor(.pink)
                        .padding(8)
                        .background(Color.pink.opacity(0.1))
                        .clipShape(Circle())
                }
            }
            
            CalendarGridView(
                currentMonth: currentMonth,
                selectedDate: $selectedDate,
                momentsByDate: momentsByDate,
                onDateTapped: { date in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        selectedDate = date
                    }
                }
            )
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 12, x: 0, y: 6)
        .gesture(
            DragGesture()
                .onEnded { value in
                    let threshold: CGFloat = 60
                    if value.translation.width > threshold {
                        withAnimation(.spring()) { previousMonth() }
                    } else if value.translation.width < -threshold {
                        withAnimation(.spring()) { nextMonth() }
                    }
                }
        )
    }

    private var dayMomentsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(selectedDate.formatted(.dateTime.month(.wide).day()))
                        .font(.title3).bold()
                    Text(selectedDate.formatted(.dateTime.weekday(.wide)))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Button(action: { showingNewMomentForm = true }) {
                    Label("新增", systemImage: "plus.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(.pink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.pink.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            
            Divider()
            
            if selectedDateMoments.isEmpty {
                EmptyDayView(date: selectedDate) {
                    showingNewMomentForm = true
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(selectedDateMoments, id: \.id) { moment in
                        CalendarMomentCard(moment: moment)
                            .onTapGesture {
                                selectedMoments = [moment]
                                showingMomentDetail = true
                            }
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.04), radius: 10, x: 0, y: 5)
    }
    
    private func statPill(icon: String, value: String, label: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.white)
                .font(.subheadline)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.headline)
                    .foregroundColor(.white)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.12))
        .clipShape(Capsule())
    }
    
    private func quickChip(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline)
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.14))
            .foregroundColor(.white)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
    
    private func previousMonth() {
        let calendar = Calendar.current
        if let newMonth = calendar.date(byAdding: .month, value: -1, to: currentMonth) {
            currentMonth = newMonth
            if !calendar.isDate(selectedDate, equalTo: newMonth, toGranularity: .month) {
                selectedDate = newMonth
            }
        }
    }
    
    private func nextMonth() {
        let calendar = Calendar.current
        if let newMonth = calendar.date(byAdding: .month, value: 1, to: currentMonth) {
            currentMonth = newMonth
            if !calendar.isDate(selectedDate, equalTo: newMonth, toGranularity: .month) {
                selectedDate = newMonth
            }
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
    private let gradient = LinearGradient(colors: [Color.pink.opacity(0.9), Color.purple.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing)
    
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
            VStack(spacing: 8) {
                Text(dayText)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(dayColor)
                
                if moments.count > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10, weight: .bold))
                        Text("\(moments.count)")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(colorForCount(moments.count).opacity(isSelected ? 0.25 : 0.15))
                    .foregroundColor(colorForCount(moments.count))
                    .clipShape(Capsule())
                } else {
                    Circle()
                        .fill(Color.gray.opacity(0.15))
                        .frame(width: 6, height: 6)
                }
            }
            .frame(width: 46, height: 60)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? gradient : backgroundColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
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
            return Color.pink.opacity(0.18)
        }
        if isToday {
            return .pink.opacity(0.12)
        }
        if moments.count > 0 {
            return colorForCount(moments.count).opacity(0.08)
        }
        return Color(.systemBackground)
    }
    
    private var borderColor: Color {
        if isToday && !isSelected {
            return .pink.opacity(0.8)
        }
        if isSelected {
            return .pink
        }
        if moments.count > 0 {
            return colorForCount(moments.count).opacity(0.35)
        }
        return .clear
    }
    
    private var borderWidth: CGFloat {
        isSelected ? 2 : (isToday && !isSelected ? 1 : 0)
    }
    
    private func moodColor(for moment: LocalLoveMoment) -> Color {
        guard let moodString = moment.mood,
              let mood = MoodType(rawValue: moodString) else {
            return .gray
        }
        return Color(mood.color)
    }

    private func colorForCount(_ count: Int) -> Color {
        switch count {
        case 0: return .gray
        case 1: return .pink
        case 2: return .purple
        default: return .red
        }
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
                    .lineLimit(3)
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
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                        Text("待同步")
                    }
                    .font(.caption)
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color(.systemBackground), Color.pink.opacity(0.06)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .cornerRadius(14)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.pink.opacity(0.25), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 6, x: 0, y: 3)
    }
}

// MARK: - Empty Day View
struct EmptyDayView: View {
    let date: Date
    let onAddMoment: () -> Void
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 46, weight: .semibold))
                .foregroundColor(.pink)
                .padding(12)
                .background(Color.pink.opacity(0.12))
                .clipShape(Circle())
            
            Text("\(date.formatted(.dateTime.month().day())) 還沒有記錄")
                .font(.headline)
                .foregroundColor(.primary)
            
            Text("點一下紀錄心情、地點或時長，\n把今天也變成甜蜜的一天。")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            
            Button(action: onAddMoment) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("立即記錄")
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    LinearGradient(
                        gradient: Gradient(colors: [.pink, .purple]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .foregroundColor(.white)
                .clipShape(Capsule())
                .shadow(color: .pink.opacity(0.25), radius: 8, x: 0, y: 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
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
