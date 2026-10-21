// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "PATSCore",
    platforms: [.macOS(.v13)],
    products: [.library(name: "PATSCore", targets: ["PATSCore"])],
    targets: [
        .target(name: "PATSCore", path: "Sources", exclude: [
            "KTMCard.swift", "ProfileEditor.swift", "DateTimeField.swift", "AdminCards.swift", "AdminEvents.swift", "AdminLoyalty.swift", "AdminToolsView.swift",
            "AppStore.swift", "CardReader.swift", "ClaimsViews.swift", "FeatureComponents.swift",
            "Info.plist", "MediaViews.swift", "MemberViews.swift", "PATSApp.swift", "RealtimeRoom.swift",
            "Resources", "CommunityOperationViews.swift", "ScannerViews.swift", "SocialViews.swift", "Theme.swift", "PrizeWheel.swift"
        ], sources: ["Core", "APIClient.swift", "Localization.swift", "DesignTokens.swift"]),
        .testTarget(name: "PATSCoreTests", dependencies: ["PATSCore"], path: "Tests/CoreTests", resources: [.copy("Fixtures")])
    ]
)
