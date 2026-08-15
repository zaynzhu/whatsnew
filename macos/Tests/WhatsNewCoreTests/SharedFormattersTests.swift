import Testing
@testable import WhatsNewCore

@Suite("共享格式化")
struct SharedFormattersTests {
  @Test("解析带和不带毫秒的 ISO 8601")
  func parsesISO8601Variants() {
    #expect(SharedFormatters.date(fromISO8601: "2026-08-15T01:20:30.123Z") != nil)
    #expect(SharedFormatters.date(fromISO8601: "2026-08-15T01:20:30Z") != nil)
  }

  @Test("格式化耗时")
  func formatsDurations() {
    #expect(SharedFormatters.durationText(milliseconds: nil) == "—")
    #expect(SharedFormatters.durationText(milliseconds: 950) == "950 ms")
    #expect(SharedFormatters.durationText(milliseconds: 1_500) == "1.5 s")
  }

  @Test("把 JSON 列表格式化为去重标签")
  func formatsJSONLists() {
    #expect(SharedFormatters.listText(#"["US","us","Drama","剧情"]"#) == "US · Drama · 剧情")
    #expect(SharedFormatters.listText(nil) == "—")
  }
}
