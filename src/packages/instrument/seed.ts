// Entry point (public surface) of the Instrument module: provision Instrument
// definitions into Medplum. Kept separate from the load entry point so callers
// that only read Instruments never pull in seeding.
//
// The project-wide CodeSystems are owned by the `terminology` package; their
// seeder is re-exported here for callers that provision an Instrument and its
// backing CodeSystems together.
export { seedInstrument, removeInstrument } from "./lib/seed.js";
export { seedCodeSystems } from "../terminology/code-systems.js";
