// Fill these two in after creating the Supabase project (Settings → API).
// Both are PUBLIC values — safe to keep in the page. The row-level rules in
// supabase-setup.md are what actually protect the data.
//
// Leave them empty and the portal runs in local demo mode (browser-only, no server).

window.MC_SUPABASE = {
  url: "https://xejvrshbsyuxvdllazpn.supabase.co",
  anonKey: "sb_publishable_txLoJwvc8mIF0KTDH_bnyg_DDJD5wpS",
  allowedDomain: "student.nitw.ac.in", // only these Google accounts may sign in
  // Demo-mode club access code (SHA-256 hash so it's not plaintext in source).
  // Current code: "nitw2026" — share only on the members' WhatsApp group.
  // To change: hash "mcnitw:clubcode:<newcode>" with SHA-256 and paste here.
  clubCodeHash: "1348c400cec05e2b42d205709e83c34b57bb4507d6658fed00949a21b411fac4"
};
