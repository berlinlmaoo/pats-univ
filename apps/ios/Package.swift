// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "PATSCore",
    platforms: [.macOS(.v13)],
    products: [.library(name: "PATSCore", targets: ["PATSCore"])],
    targets: [
        .target(name: "PATSCore", path: "Sources/Core"),
        .testTarget(name: "PATSCoreTests", dependencies: ["PATSCore"], path: "Tests/CoreTests", resources: [.copy("Fixtures")])
    ]
)
