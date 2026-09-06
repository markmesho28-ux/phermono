import { getGuestLimitStatus } from "./ChatWidget";

describe("guest chat limit logic", () => {
  it("allows guests while they are under the daily limit", () => {
    expect(getGuestLimitStatus(19, 20)).toEqual({ allowed: true, remaining: 1 });
  });

  it("blocks guests once the daily limit is reached", () => {
    expect(getGuestLimitStatus(20, 20)).toEqual({ allowed: false, remaining: 0 });
  });
});
