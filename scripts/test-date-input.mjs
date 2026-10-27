import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule } from "node:vm";
import { test } from "node:test";
const module = new SourceTextModule(await readFile(new URL("../src/lib/dateInput.js", import.meta.url),"utf8"));
await module.link(() => { throw Error("Unexpected dependency"); }); await module.evaluate();
const {parseManualDate,formatManualDate,formatDateDraft} = module.namespace;
test("manual DD/MM/YYYY validates real days and leap years without rollover", () => {
  for (const [input, expected] of [["15/06/1950","1950-06-15"],["29/02/2000","2000-02-29"],["01/01/0001","0001-01-01"]]) assert.equal(parseManualDate(input),expected);
  for (const input of ["31/02/1990","29/02/1900","31/04/2001","00/01/2000","01/13/2000","01/01/0000","1/2/1990","2000-01-01","abc",""]) assert.equal(parseManualDate(input),null,input);
});
test("typing and ISO display preserve date-only values without timezone conversion", () => {
  assert.equal(formatDateDraft("15061950"),"15/06/1950");
  assert.equal(formatDateDraft("15/06/1950"),"15/06/1950");
  assert.equal(formatDateDraft("1506"),"15/06");
  assert.equal(formatManualDate("1950-06-15"),"15/06/1950");
  assert.equal(formatManualDate("1950-06-15T09:30"),"15/06/1950");
  assert.equal(formatManualDate(""),"");
});
