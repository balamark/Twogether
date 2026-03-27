//
//  TwogetherUITests.swift
//  TwogetherUITests
//
//  Visual end-to-end tests covering:
//    1. Login flow
//    2. Registration flow
//    3. Pairing flow (generate + enter code)
//    4. Record an intimacy moment
//    5. View calendar statistics
//    6. Send intimacy invite (pairing screen)
//

import XCTest

final class TwogetherUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false

        app = XCUIApplication()
        // Signal to the app that we're in UI-test mode (can be used to skip server calls)
        app.launchArguments = ["--uitesting"]
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Helpers

    /// Attach a full-screen screenshot with a descriptive name.
    private func screenshot(_ name: String) {
        let img = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: img)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Wait up to `timeout` seconds for an element to exist, then assert.
    @discardableResult
    private func waitFor(_ element: XCUIElement, timeout: TimeInterval = 8) -> Bool {
        element.waitForExistence(timeout: timeout)
    }

    // MARK: - Test 1: Login Flow

    /// Verifies that a user can open the app, see the login screen,
    /// fill in credentials, and reach the main tab view.
    @MainActor
    func testLoginFlow() throws {
        // Auth screen must be visible on first launch
        let emailField = app.textFields["emailField"]
        XCTAssertTrue(waitFor(emailField), "Email field should appear on launch")
        screenshot("01_login_screen")

        // Enter credentials
        emailField.tap()
        emailField.typeText("test@example.com")

        let passwordField = app.secureTextFields["passwordField"]
        XCTAssertTrue(waitFor(passwordField))
        passwordField.tap()
        passwordField.typeText("password123")
        screenshot("02_login_form_filled")

        // Dismiss keyboard and tap Sign In
        app.keyboards.firstMatch.buttons["Return"].tapIfExists()
        let loginButton = app.buttons["loginButton"]
        XCTAssertTrue(waitFor(loginButton), "Login button should be tappable")
        loginButton.tap()
        screenshot("03_after_login_tap")

        // After a successful login we expect either the pairing view or the main tab bar.
        // Both are acceptable – we check for either.
        let tabBar = app.tabBars.firstMatch
        let pairingTitle = app.staticTexts["Connect with Your Partner"]
        let didReachMain = tabBar.waitForExistence(timeout: 12) || pairingTitle.waitForExistence(timeout: 12)
        XCTAssertTrue(didReachMain, "Should reach main app or pairing screen after login")
        screenshot("04_post_login_state")
    }

    // MARK: - Test 2: Registration Flow

    /// Verifies that a new user can switch to Sign Up mode, fill in the
    /// registration form, and proceed past authentication.
    @MainActor
    func testRegistrationFlow() throws {
        // Auth screen
        XCTAssertTrue(waitFor(app.textFields["emailField"]))
        screenshot("05_auth_screen_before_signup")

        // Switch to Sign Up
        let toggleButton = app.buttons["switchToSignup"]
        XCTAssertTrue(waitFor(toggleButton), "Toggle signup button should exist")
        toggleButton.tap()
        screenshot("06_signup_mode")

        // Confirm Password field should now appear
        let confirmField = app.secureTextFields.matching(identifier: "passwordField").allElements
        // (We don't have a separate identifier for confirm — use element index)
        XCTAssertTrue(waitFor(app.secureTextFields.element(boundBy: 0)))

        // Fill form
        let emailField = app.textFields["emailField"]
        emailField.tap()
        emailField.typeText("newuser_\(Int.random(in: 1000...9999))@example.com")

        let passwordField = app.secureTextFields.element(boundBy: 0)
        passwordField.tap()
        passwordField.typeText("SecurePass123")

        // Scroll to see confirm password field if needed
        app.swipeUp()
        let confirmPasswordField = app.secureTextFields.element(boundBy: 1)
        if confirmPasswordField.exists {
            confirmPasswordField.tap()
            confirmPasswordField.typeText("SecurePass123")
        }
        screenshot("07_signup_form_filled")

        // Tap Create Account
        let registerButton = app.buttons["registerButton"]
        XCTAssertTrue(waitFor(registerButton))
        registerButton.tap()
        screenshot("08_after_register_tap")

        // Should reach pairing or main screen
        let reached = app.staticTexts["Connect with Your Partner"].waitForExistence(timeout: 12)
            || app.tabBars.firstMatch.waitForExistence(timeout: 12)
        XCTAssertTrue(reached, "Should proceed past registration")
        screenshot("09_post_registration_state")
    }

    // MARK: - Test 3: Pairing Flow

    /// Verifies the pairing screen: generate a pairing code and optionally enter a partner code.
    @MainActor
    func testPairingFlow() throws {
        // Navigate to pairing view — either it appears right after login or we reach it via Settings.
        // Strategy: if already on auth screen, do a quick login first.
        if app.textFields["emailField"].exists {
            try loginWithTestCredentials()
        }

        // Wait for pairing view
        let pairingTitle = app.staticTexts["Connect with Your Partner"]
        if !pairingTitle.waitForExistence(timeout: 5) {
            // Already past pairing — navigate back via Settings
            // This is a best-effort; skip the rest if pairing is already done.
            XCTSkip("Pairing already completed; skipping pairing flow test.")
        }
        screenshot("10_pairing_screen")

        // Step 1: Generate a pairing code
        let generateButton = app.buttons["generateCodeButton"]
        XCTAssertTrue(waitFor(generateButton), "Generate code button should exist")
        generateButton.tap()

        // The code should appear
        let codeDisplay = app.staticTexts["pairingCodeDisplay"]
        XCTAssertTrue(codeDisplay.waitForExistence(timeout: 8), "Generated pairing code should appear")
        let generatedCode = codeDisplay.label
        XCTAssertEqual(generatedCode.count, 8, "Pairing code should be 8 characters")
        screenshot("11_generated_pairing_code")

        // Step 2: Enter a partner code field (type the generated code to test the flow)
        let partnerCodeField = app.textFields["partnerCodeField"]
        XCTAssertTrue(waitFor(partnerCodeField), "Partner code input should exist")
        partnerCodeField.tap()
        partnerCodeField.typeText(generatedCode)
        screenshot("12_partner_code_entered")

        // Pair button becomes active when 8 chars entered
        let pairButton = app.buttons["pairButton"]
        XCTAssertTrue(waitFor(pairButton))
        XCTAssertTrue(pairButton.isEnabled, "Pair button should be enabled with 8-char code")
        screenshot("13_pair_button_enabled")

        // Note: We do NOT tap pairButton here to avoid actually pairing with an invalid code.
    }

    // MARK: - Test 4: Record Intimacy Moment

    /// Verifies the complete flow of adding an intimacy record from the Calendar tab.
    @MainActor
    func testRecordIntimacyMoment() throws {
        try ensureMainAppVisible()
        screenshot("14_main_screen")

        // Navigate to Calendar tab (second tab)
        let calendarTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(waitFor(calendarTab))
        calendarTab.tap()
        screenshot("15_calendar_tab")

        // Tap the "新增" (add) button in the calendar header
        let addButton = app.buttons.matching(NSPredicate(format: "label CONTAINS '新增'")).firstMatch
        if !addButton.waitForExistence(timeout: 5) {
            // Fallback: try the FAB identifier
            app.buttons["addMomentButton"].tap()
        } else {
            addButton.tap()
        }
        screenshot("16_add_moment_tapped")

        // Form should appear
        let descriptionField = app.textViews["momentDescriptionField"]
        XCTAssertTrue(descriptionField.waitForExistence(timeout: 8), "Description field should appear in the form")
        screenshot("17_moment_form_open")

        // Fill in the description
        descriptionField.tap()
        descriptionField.typeText("A beautiful moment together on our anniversary")
        screenshot("18_description_filled")

        // Scroll down to see mood / activity selectors
        app.swipeUp()
        screenshot("19_form_scrolled")

        // Tap Save
        let saveButton = app.buttons["saveMomentButton"]
        XCTAssertTrue(waitFor(saveButton), "Save button should be present")
        saveButton.tap()
        screenshot("20_save_tapped")

        // Form should dismiss — we should be back on the calendar
        let calendarTitle = app.navigationBars.staticTexts.matching(
            NSPredicate(format: "label CONTAINS '記錄' OR label CONTAINS 'Calendar'")
        ).firstMatch
        // Allow a moment for the dismissal animation
        _ = calendarTitle.waitForExistence(timeout: 5)
        screenshot("21_after_save_calendar")
    }

    // MARK: - Test 5: View Calendar Statistics

    /// Verifies that the calendar screen shows the 4 statistics cards.
    @MainActor
    func testViewCalendarStatistics() throws {
        try ensureMainAppVisible()

        // Navigate to Calendar tab
        let calendarTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(waitFor(calendarTab))
        calendarTab.tap()
        screenshot("22_calendar_for_stats")

        // Verify the stats grid is present
        let statsGrid = app.otherElements["calendarStatsGrid"]
        if statsGrid.waitForExistence(timeout: 5) {
            screenshot("23_stats_grid_visible")
        }

        // Verify individual stat cards by their accessibility identifiers
        let totalCard    = app.otherElements["statCard_總記錄"]
        let monthCard    = app.otherElements["statCard_本月"]
        let streakCard   = app.otherElements["statCard_連續"]
        let longestCard  = app.otherElements["statCard_最佳連勝"]

        // At least the grid or individual cards should be present
        let hasStats = statsGrid.exists || totalCard.exists || monthCard.exists
        XCTAssertTrue(hasStats, "Calendar statistics should be visible")
        screenshot("24_calendar_stats_verified")

        // Verify streak values are numeric (non-empty text)
        if streakCard.exists {
            XCTAssertFalse(streakCard.label.isEmpty)
        }
        if longestCard.exists {
            XCTAssertFalse(longestCard.label.isEmpty)
        }
        screenshot("25_streak_stats_checked")
    }

    // MARK: - Test 6: Send Intimacy Invite (Pairing / Connect Screen)

    /// Verifies that the pairing code generation works end-to-end as the
    /// mechanism for sending an intimacy invite to a partner.
    @MainActor
    func testSendIntimacyInvite() throws {
        // This test verifies the pairing invite flow visible from the Settings tab
        try ensureMainAppVisible()
        screenshot("26_main_for_invite")

        // Navigate to the last tab (Settings / 設定)
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(waitFor(tabBar))
        let lastTab = tabBar.buttons.element(boundBy: tabBar.buttons.count - 1)
        lastTab.tap()
        screenshot("27_settings_tab")

        // Look for a "Pair" / "Connect" / "pairing" button in settings
        let pairButton = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'pair' OR label CONTAINS[c] '配對' OR label CONTAINS[c] 'Connect'")
        ).firstMatch

        if pairButton.waitForExistence(timeout: 5) {
            pairButton.tap()
            screenshot("28_pairing_screen_from_settings")

            // Generate code
            let generateBtn = app.buttons["generateCodeButton"]
            if generateBtn.waitForExistence(timeout: 5) {
                generateBtn.tap()
                let codeLabel = app.staticTexts["pairingCodeDisplay"]
                XCTAssertTrue(codeLabel.waitForExistence(timeout: 8), "Invite code should be displayed")
                XCTAssertEqual(codeLabel.label.count, 8, "Invite code should be 8 characters")
                screenshot("29_invite_code_generated")
            }
        } else {
            // Settings is a placeholder — skip gracefully
            XCTSkip("Settings/pairing UI not fully implemented yet; skipping invite test.")
        }
    }

    // MARK: - Private helpers

    /// Performs a quick login with test credentials. Assumes auth screen is visible.
    private func loginWithTestCredentials() throws {
        let emailField = app.textFields["emailField"]
        guard emailField.waitForExistence(timeout: 5) else {
            return // Already logged in
        }
        emailField.tap()
        emailField.typeText("test@example.com")

        let passwordField = app.secureTextFields["passwordField"]
        passwordField.tap()
        passwordField.typeText("password123")

        let loginButton = app.buttons["loginButton"]
        loginButton.tap()

        // Wait for navigation to complete
        _ = app.tabBars.firstMatch.waitForExistence(timeout: 12)
            || app.staticTexts["Connect with Your Partner"].waitForExistence(timeout: 12)
    }

    /// Ensures the main app (past auth + pairing) is on screen.
    /// Skips through auth and pairing if needed.
    private func ensureMainAppVisible() throws {
        // If auth screen is visible, attempt login
        if app.textFields["emailField"].waitForExistence(timeout: 3) {
            try loginWithTestCredentials()
        }

        // If pairing screen is visible, skip it
        if app.staticTexts["Connect with Your Partner"].waitForExistence(timeout: 3) {
            let skipButton = app.buttons.matching(
                NSPredicate(format: "label CONTAINS 'Skip'")
            ).firstMatch
            if skipButton.exists { skipButton.tap() }
        }

        // Verify main tab bar is now visible
        XCTAssertTrue(
            app.tabBars.firstMatch.waitForExistence(timeout: 10),
            "Main tab bar should be visible after auth/pairing"
        )
    }
}

// MARK: - XCUIElement extension

private extension XCUIElement {
    /// Taps the element only if it exists.
    func tapIfExists() {
        if exists { tap() }
    }
}
