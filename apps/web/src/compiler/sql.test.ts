import { bool, disableOptimizers, ident, list, num, setExtensionRepository, str, strList } from './sql';

describe('sql quoting', () => {
  it('doubles quotes inside identifiers and strings', () => {
    expect(ident('say "hi"')).toBe('"say ""hi"""');
    expect(str("it's")).toBe("'it''s'");
    expect(strList(['a', "b'c"])).toBe("['a', 'b''c']");
  });

  it('writes numbers and booleans, and refuses numbers SQL can’t hold', () => {
    expect(num(1.5)).toBe('1.5');
    expect(() => num(Number.NaN)).toThrow(RangeError);
    expect(() => num(Infinity)).toThrow(RangeError);
    expect(bool(true)).toBe('true');
    expect(list(['a', 'b'])).toBe('a, b');
  });

  it('quotes the extension repository and optimizer settings', () => {
    expect(setExtensionRepository("https://x.example/it's")).toEqual([
      "SET custom_extension_repository = 'https://x.example/it''s'",
      "SET autoinstall_extension_repository = 'https://x.example/it''s'",
    ]);
    expect(disableOptimizers(['a', 'b'])).toBe("SET disabled_optimizers = 'a,b'");
  });
});
