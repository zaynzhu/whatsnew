// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "WhatsNewMac",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(
      name: "WhatsNewCore",
      targets: ["WhatsNewCore"]
    ),
    .executable(
      name: "WhatsNewMac",
      targets: ["WhatsNewMac"]
    )
  ],
  targets: [
    .target(
      name: "WhatsNewCore"
    ),
    .executableTarget(
      name: "WhatsNewMac",
      dependencies: ["WhatsNewCore"]
    ),
    .testTarget(
      name: "WhatsNewCoreTests",
      dependencies: ["WhatsNewCore"]
    )
  ]
)
