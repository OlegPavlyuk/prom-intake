import { Alert, Text } from "@mantine/core";
import type { CrisisResponseConfig } from "../../../../packages/domain/instrument.js";

export interface CrisisResponseProps {
  readonly crisisResponse: CrisisResponseConfig;
}

// The Crisis Response (FR-15): shown the instant a patient gives a positive
// answer to the acute-risk item, independent of whether they go on to submit.
// Purely informational, purely client-side - it creates no server resource
// and raises no Flag (that is the separate, server-side Acute-risk trigger,
// FR-20). Content/locale is config-driven (v1 default: US 988).
export function CrisisResponse({
  crisisResponse,
}: CrisisResponseProps): JSX.Element {
  return (
    <Alert
      role="alert"
      color="red"
      title="You're not alone - help is available"
    >
      <Text>{crisisResponse.message}</Text>
      <Text fw={700} mt="xs">
        Call or text {crisisResponse.phone}
      </Text>
    </Alert>
  );
}
