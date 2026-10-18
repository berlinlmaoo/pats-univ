import SwiftUI

struct AdminToolsView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        Page(title: "app.adminTitle") {
            if store.offline { Notice(text: L.t("native.offline")) }
            Text(store.user["city"]["name"].text.isEmpty ? L.t("app.adminSubtitleHq") : L.t("app.adminSubtitle", ["city": store.user["city"]["name"].text])).foregroundStyle(Theme.muted)
            Panel {
                if store.can("checkin.scan") {
                    NavigationRow(title: "app.adminScan", subtitle: L.t("app.adminScanBody"), icon: "qrcode.viewfinder") { ScanEventPicker() }
                    NavigationRow(title: "app.adminEvents", subtitle: L.t("app.adminEventsBody"), icon: "calendar") { EventsView(admin: true) }
                }
                if store.can("reward.validate") { NavigationRow(title: "loyalty.validateReward", icon: "gift") { RewardValidationView() } }
                if store.can("promoter.manage") { NavigationRow(title: "phase5.claimReview", icon: "doc.text.magnifyingglass") { ClaimsReviewView() } }
                if store.can("city.operations") { NavigationRow(title: "loyalty.operations", icon: "chart.bar") { CrewOperationsView() } }
                if store.can("card.encode") { NavigationRow(title: "app.adminEncode", icon: "wave.3.right") { EncodingBatchesView() } }
                if store.can("card.handover") { NavigationRow(title: "app.adminHandover", icon: "person.crop.rectangle") { HandoverView() } }
                if store.can("card.reportLost") { NavigationRow(title: "app.adminCards", icon: "creditcard") { MemberCardsView() } }
                NavigationRow(title: "social.title", icon: "bubble.left.and.bubble.right") { SocialHubView() }
                NavigationRow(title: "social.operations", icon: "list.bullet.rectangle") { SocialOperationsView() }
                NavigationRow(title: "app.notificationsTitle", icon: "bell") { NotificationsView() }
            }
        }
    }
}
