import SwiftUI

/// Fixed presentation is independent of the phone's language and 12/24-hour preference.
struct DateTimeField: View {
    let key: String
    @Binding var value: Date
    var time = false
    var zone = TimeZone(identifier: "Asia/Jakarta")!
    @State private var presented = false
    private var formatted: String { L.inputDate(value, time: time, zone: zone) }
    private var label: String { L.t(key) + " · " + L.zoneName(zone.identifier, at: value) }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).font(Theme.label).tracking(0.66).foregroundStyle(Theme.muted)
            Button { presented = true } label: {
                HStack { Text(formatted).monospacedDigit(); Spacer(); Image(systemName: time ? "clock" : "calendar") }
            }.buttonStyle(PATSButtonStyle(variant: .secondary)).accessibilityLabel(label).accessibilityValue(formatted)
        }.sheet(isPresented: $presented) {
            NavigationStack {
                DatePicker(label, selection: $value, displayedComponents: time ? .hourAndMinute : .date)
                    .datePickerStyle(.wheel).labelsHidden()
                    .environment(\.locale, Locale(identifier: "en_GB@hours=h23"))
                    .environment(\.calendar, Calendar(identifier: .gregorian)).environment(\.timeZone, zone)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.bg)
                    .navigationTitle("").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .principal) { VarsityText(text: label) }
                        ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { presented = false }.frame(minWidth: 44, minHeight: 44) }
                    }.bandNavigation()
            }.presentationDetents([.medium])
        }
    }
}
