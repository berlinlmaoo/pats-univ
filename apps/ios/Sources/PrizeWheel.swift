import SwiftUI

/// Five outlined name slots; the server alone supplies the winner.
struct DrawSlots: View {
    let entries: [JSON]
    let capacity: Int
    let winnerID: String
    var body: some View {
        VStack(spacing: 8) {
            ForEach(0..<5, id: \.self) { index in
                let entry = entries.first { $0["position"].int == index + 1 }
                HStack {
                    Text(L.count(index + 1)).font(Theme.label).monospacedDigit().frame(width: 24)
                    Text(entry?["name"].text ?? L.t("ktm.emptySlot")).font(Theme.body(14))
                    Spacer()
                    if let entry, entry.id == winnerID { Image(systemName: "trophy").foregroundStyle(Theme.color("goldText")) }
                }.frame(minHeight: 44).padding(.horizontal, Theme.gap)
                    .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius).stroke(Theme.color("borderStrong")))
            }
        }.accessibilityElement(children: .contain).accessibilityLabel(L.t("phase5.draw"))
    }
}
struct RankChip: View {
    let rank: Int
    private var fill: Color { rank == 1 ? Theme.color("gold") : rank == 2 ? Theme.color("surfaceMuted") : rank == 3 ? Theme.color("secondary") : .clear }
    private var ink: Color { rank == 1 ? Color(uiColor: UIColor(hex: "#001836")) : rank == 3 ? Theme.color("secondaryText") : Theme.text }
    var body: some View { Text(L.count(rank)).font(Theme.label).monospacedDigit().frame(minWidth: 32, minHeight: 32).background(fill, in: RoundedRectangle(cornerRadius: 4)).foregroundStyle(ink) }
}
