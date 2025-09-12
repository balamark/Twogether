//
//  TwogetherApp.swift
//  Twogether
//
//  Created by Ting-An Wang on 7/27/25.
//

import SwiftUI
import SwiftData

@main
struct TwogetherApp: App {
    let offlineManager = OfflineManager.shared
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(offlineManager.modelContainer)
                .environmentObject(offlineManager)
                .environmentObject(APIClient.shared)
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                    Task {
                        await offlineManager.performFullSync()
                    }
                }
        }
    }
}
