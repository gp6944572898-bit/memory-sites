import { describe, expect, it } from "vitest"

import { normalizeSubdomain, validateSubdomain } from "./subdomainRules"

describe("validateSubdomain", () => {
  it("принимает обычное имя", () => {
    expect(validateSubdomain("ivanov-1950")).toBeNull()
  })

  it("приводит регистр и убирает пробелы", () => {
    expect(normalizeSubdomain("  Ivanov ")).toBe("ivanov")
    expect(validateSubdomain("  Ivanov ")).toBeNull()
  })

  it("отклоняет слишком короткие и слишком длинные", () => {
    expect(validateSubdomain("ab")).not.toBeNull()
    expect(validateSubdomain("a".repeat(31))).not.toBeNull()
  })

  it("отклоняет недопустимые символы и дефисы по краям", () => {
    expect(validateSubdomain("иванов")).not.toBeNull()
    expect(validateSubdomain("a_b")).not.toBeNull()
    expect(validateSubdomain("-abc")).not.toBeNull()
    expect(validateSubdomain("abc-")).not.toBeNull()
    expect(validateSubdomain("a--b")).not.toBeNull()
  })

  it("отклоняет зарезервированные имена", () => {
    expect(validateSubdomain("admin")).not.toBeNull()
    expect(validateSubdomain("WWW")).not.toBeNull()
  })
})
