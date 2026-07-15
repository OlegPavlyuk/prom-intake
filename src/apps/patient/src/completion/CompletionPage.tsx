import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Center, Container, Stack, Text, Title } from "@mantine/core";
import { getQuestionnaireAnswers } from "@medplum/core";
import type {
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
} from "@medplum/fhirtypes";
import { QuestionnaireForm } from "@medplum/react";
import type { Instrument } from "../../../../packages/domain/instrument.js";
import { isAcuteRiskAnswer } from "../../../../packages/domain/instrument-queries.js";
import { toQuestionnaire } from "../../../../packages/instrument/index.js";
import { CrisisResponse } from "./CrisisResponse";
import type { ResolvePatientAccessLink } from "./resolvePatientAccessLink";

export interface CompletionPageProps {
  /** The token presented in the Access-link URL, or `null` if none was given. */
  readonly token: string | null;
  /** The account-less "open" seam - injectable so tests never hit the network. */
  readonly resolve: ResolvePatientAccessLink;
  /**
   * Called once every required item is answered and the patient chooses to
   * submit. The actual server write is #17's; this ticket only gates the
   * control.
   */
  readonly onSubmit?: () => void;
}

type PageState =
  | { readonly kind: "loading" }
  | { readonly kind: "not-found" }
  | { readonly kind: "expired" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly instrument: Instrument };

// The account-less patient completion page (FR-11, FR-13, ADR-0005): resolves
// the token, renders the blank Instrument for a valid link, and shows a
// friendly page for anything else - never an error or a blank form.
export function CompletionPage({
  token,
  resolve,
  onSubmit,
}: CompletionPageProps): JSX.Element {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "not-found" });
      return;
    }
    setState({ kind: "loading" });
    resolve(token)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState(
          result.status === "valid"
            ? { kind: "ready", instrument: result.instrument }
            : { kind: result.status }
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, resolve]);

  if (state.kind === "loading") {
    return (
      <FullPageCenter>
        <Text c="dimmed">Loading your questionnaire...</Text>
      </FullPageCenter>
    );
  }

  if (state.kind !== "ready") {
    return <FriendlyStatusPage kind={state.kind} />;
  }

  return <InstrumentForm instrument={state.instrument} onSubmit={onSubmit} />;
}

function FullPageCenter({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return <Center mih="100vh">{children}</Center>;
}

function FriendlyStatusPage({
  kind,
}: {
  readonly kind: "not-found" | "expired" | "error";
}): JSX.Element {
  const copy: Record<typeof kind, { title: string; body: string }> = {
    "not-found": {
      title: "This link isn't valid",
      body: "This link doesn't match a questionnaire we can find. Please check that you copied the full link, or ask your care coordinator to send a new one.",
    },
    expired: {
      title: "This link is no longer available",
      body: "This link has expired or was already used. Please contact your care coordinator if you still need to complete a questionnaire.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn't load your questionnaire right now. Please try the link again shortly.",
    },
  };
  const { title, body } = copy[kind];

  return (
    <FullPageCenter>
      <Container size="xs">
        <Stack gap="sm" ta="center">
          <Title order={2}>{title}</Title>
          <Text c="dimmed">{body}</Text>
        </Stack>
      </Container>
    </FullPageCenter>
  );
}

function InstrumentForm({
  instrument,
  onSubmit,
}: {
  readonly instrument: Instrument;
  readonly onSubmit?: () => void;
}): JSX.Element {
  const questionnaire = useMemo(
    () => toQuestionnaire(instrument),
    [instrument]
  );
  const [answers, setAnswers] = useState<
    Record<string, QuestionnaireResponseItemAnswer>
  >({});
  const [crisisVisible, setCrisisVisible] = useState(false);

  function handleChange(response: QuestionnaireResponse): void {
    const nextAnswers = getQuestionnaireAnswers(response);
    setAnswers(nextAnswers);

    const acuteRiskLinkId = instrument.acuteRiskItemLinkId;
    const code = acuteRiskLinkId
      ? nextAnswers[acuteRiskLinkId]?.valueCoding?.code
      : undefined;
    if (
      acuteRiskLinkId &&
      code &&
      isAcuteRiskAnswer(instrument, acuteRiskLinkId, code)
    ) {
      // Sticky once shown - a safety message should not disappear just
      // because the patient revises an earlier answer (FR-15).
      setCrisisVisible(true);
    }
  }

  const isComplete = instrument.items.every(
    (item) => answers[item.linkId] !== undefined
  );

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        {/* QuestionnaireForm renders the Instrument's own title as an <h1>. */}
        <Text c="dimmed" size="sm">
          Your answers aren't saved until you submit - if you leave and come
          back, you'll start again.
        </Text>

        {crisisVisible && instrument.crisisResponse && (
          <CrisisResponse crisisResponse={instrument.crisisResponse} />
        )}

        <QuestionnaireForm
          questionnaire={questionnaire}
          disablePagination
          excludeButtons
          onChange={handleChange}
        />

        <Button
          disabled={!isComplete}
          onClick={() => onSubmit?.()}
          style={{ alignSelf: "flex-start" }}
        >
          Submit
        </Button>
      </Stack>
    </Container>
  );
}
