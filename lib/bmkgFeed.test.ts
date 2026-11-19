import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCap, parseNowcast, parseQuakeLists } from "./bmkgFeed.ts";

const quake = {
  Tanggal: "19 Nov 2026",
  Jam: "08:34:48 WIB",
  DateTime: "2026-11-19T01:34:48+00:00",
  Coordinates: "0.47,96.56",
  Magnitude: "5.4",
  Kedalaman: "12 km",
};

test("merges BMKG's M5+ and felt lists on their timestamp, newest first", () => {
  const strong = { Infogempa: { gempa: [{ ...quake, Wilayah: "114 km BaratDaya NIASBARAT-SUMUT", Potensi: "Tidak berpotensi tsunami" }] } };
  const felt = {
    Infogempa: {
      gempa: [
        { ...quake, Wilayah: "Pusat gempa berada di laut 114 km Barat Daya Nias Barat", Dirasakan: "II Nias Selatan" },
        { ...quake, DateTime: "2026-11-20T00:00:00+00:00", Wilayah: "di darat", Dirasakan: "III Kendari" },
        { ...quake, DateTime: "bukan tanggal", Wilayah: "x" },
      ],
    },
  };
  const [newest, nias] = parseQuakeLists(strong, felt);
  assert.equal(newest.felt, "III Kendari");
  assert.equal(nias.place, "di laut 114 km Barat Daya Nias Barat");
  assert.equal(nias.potential, "Tidak berpotensi tsunami");
  assert.equal(nias.felt, "II Nias Selatan");
  assert.equal(parseQuakeLists(strong, null)[0].place, "114 km Barat Daya Nias Barat");
  const seram = { Infogempa: { gempa: [{ ...quake, Wilayah: "20 km BaratLaut SERAMBAGIANTIMUR-MALUKU" }] } };
  assert.equal(parseQuakeLists(seram, null)[0].place, "20 km Barat Laut Seram Bagian Timur");
  assert.deepEqual(parseQuakeLists(null, { Infogempa: {} }), []);
});

test("reads a nowcast alert's area, expiry, hazards and squares", () => {
  const links = parseNowcast(
    "<link>https://www.bmkg.go.id/alerts/nowcast/id/rss.xml</link><link>https://www.bmkg.go.id/alerts/nowcast/id/CKS20261119002_alert.xml</link><link>https://evil.example/x_alert.xml</link>",
  );
  assert.deepEqual(links, ["https://www.bmkg.go.id/alerts/nowcast/id/CKS20261119002_alert.xml"]);

  const cap = `<alert><info><headline>Hujan Lebat disertai Petir di Kalimantan Selatan</headline>
    <expires>2026-11-19T15:00:00+08:00</expires>
    <description>Hujan lebat akan terjadi di sebagian wilayah Kalimantan Selatan, khususnya di ARANIO, BAJUIN, JORONG.
    Kondisi ini berpotensi menimbulkan dampak berupa jarak pandang berkurang, angin kencang, dan banjir lokal.</description>
    <area><areaDesc>Kalimantan Selatan</areaDesc><polygon>-3.0,114.0 -3.0,115.0 -4.0,115.0 -4.0,114.0 -3.0,114.0</polygon>
    <polygon>99,999 1,2</polygon></area></info></alert>`;
  const w = parseCap(cap)!;
  assert.equal(w.area, "Kalimantan Selatan");
  assert.equal(w.until, "15.00 WITA");
  assert.equal(w.districts, 3);
  assert.deepEqual(w.hazards, ["banjir", "angin"]);
  // A 1° square is 5 × 5 squares of 0.2°, plus the corner squares on its far edges.
  assert.ok(w.cells.length >= 25 && w.cells.length <= 36, `${w.cells.length}`);
  assert.ok(w.cells.every(([x, y]) => x >= 570 && x <= 575 && y >= -20 && y <= -15));
  assert.equal(parseCap("<alert></alert>"), null);
});
