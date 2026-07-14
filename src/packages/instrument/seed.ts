// Entry point (public surface) of the Instrument module: provision Instrument
// definitions and the project CodeSystems into Medplum. Kept separate from the
// load entry point so callers that only read Instruments never pull in seeding.
export {
  seedCodeSystems,
  seedInstrument,
  removeInstrument,
} from "./lib/seed.js";
