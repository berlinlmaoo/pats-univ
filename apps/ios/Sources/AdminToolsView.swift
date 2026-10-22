import SwiftUI

struct AdminToolsView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        AdminModeRequired(capability: "checkin.scan") {
            Page(title: "ux.tools.title") {
                if store.offline { Notice(text: L.t("native.offline")) }
                Text(store.scope).font(Theme.title(20))
                Panel {
                    CardHeading(key: "ux.tools.eventWork")
                    NavigationRow(title: "app.adminEvents", subtitle: L.t("ux.tools.eventWorkBody"), icon: "calendar") { EventsView(admin: true) }
                    NavigationRow(title: "app.adminScan", icon: "qrcode.viewfinder") { ScanEventPicker() }
                    NavigationRow(title: "social.operations", icon: "list.bullet.rectangle") { SocialOperationsView() }
                    if store.can("reward.validate") { NavigationRow(title: "loyalty.validateReward", icon: "gift") { RewardValidationView() } }
                    if store.can("promoter.manage") { NavigationRow(title: "phase5.claimReview", icon: "doc.text.magnifyingglass") { ClaimsReviewView() } }
                    if store.can("promoter.manage") { NavigationRow(title: "ux.posterProof.queueTitle", icon: "photo.badge.checkmark") { PosterProofReviewView() } }
                    if store.can("city.operations") { NavigationRow(title: "ux.report.dashboardTitle", icon: "doc.text") { EventReportListView() } }
                    if store.can("city.operations") { NavigationRow(title: "loyalty.operations", icon: "chart.bar") { CrewOperationsView() } }
                }
                Panel {
                    CardHeading(key: "ux.tools.cardWork")
                    if store.can("card.encode") { NavigationRow(title: "app.adminEncode", icon: "wave.3.right") { EncodingBatchesView() } }
                    if store.can("card.handover") { NavigationRow(title: "app.adminHandover", icon: "person.crop.rectangle") { HandoverView() } }
                    if store.can("card.reportLost") { NavigationRow(title: "app.adminCards", icon: "creditcard") { MemberCardsView() } }
                }
                if store.can("dashboard.access") {
                    Panel {
                        CardHeading(key: "ux.tools.web")
                        Text(L.t(store.can("hq.manage") ? "ux.tools.webHqBody" : "ux.tools.webRegionalBody")).font(Theme.body(14)).foregroundStyle(Theme.muted)
                        Link(L.t("ux.tools.openDashboard"), destination: Config.url(store.can("hq.manage") ? "/overview" : "/regional"))
                            .buttonStyle(PATSButtonStyle(variant: .maroon))
                        Text(L.t("ux.tools.webReturn")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
    }
}
