import SwiftUI

/// Equal name slots present the server's saved winner. The client never selects a winner.
struct PrizeWheel: View {
    let entries: [JSON]
    let capacity: Int
    let winnerID: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rotation = 0.0
    var body: some View {
        ZStack(alignment: .top) {
            Canvas { context, size in
                let diameter = min(size.width, size.height) * 0.9
                let center = CGPoint(x: size.width/2, y: size.height/2)
                let count = max(1, min(20, capacity))
                for index in 0..<count {
                    let angle = Double(index) * 360/Double(count) - 90
                    var sector = Path(); sector.move(to: center)
                    sector.addArc(center: center, radius: diameter/2, startAngle: .degrees(angle), endAngle: .degrees(angle + 360/Double(count)), clockwise: false)
                    sector.closeSubpath()
                    context.fill(sector, with: .color(Theme.color(index.isMultiple(of: 2) ? "primary" : "accentSubtle")))
                    context.stroke(sector, with: .color(Theme.border), lineWidth: 2)
                }
                context.fill(Path(ellipseIn: CGRect(x: center.x - 15, y: center.y - 15, width: 30, height: 30)), with: .color(Theme.surface))
            }.rotationEffect(.degrees(rotation))
            Image(systemName: "arrowtriangle.down.fill").foregroundStyle(Theme.accent).font(.title2)
        }.frame(height: Theme.qr).accessibilityLabel(L.t("phase5.draw"))
            .onAppear { align(animated: false) }
            .onChange(of: winnerID) { _, _ in align(animated: true) }
    }
    private func align(animated: Bool) {
        guard let winner = entries.first(where: { $0.id == winnerID }), capacity > 0 else { return }
        let target = 360 - (Double(winner["position"].int) - 0.5) * 360/Double(capacity)
        withAnimation(animated && !reduceMotion ? .easeOut(duration: 1.2) : nil) { rotation = (animated && !reduceMotion ? 1440 : 0) + target }
    }
}
