import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Center, Container, Stack, Text, Title } from "@mantine/core";
import { getQuestionnaireAnswers } from "@medplum/core";
import type {
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
} from "@medplum/fhirtypes";
import { QuestionnaireForm } from "@medplum/react";
import type { Instrument } from "../../../../packages/domain/instrument.js";
import type { ResponseAnswer } from "../../../../packages/domain/workflow.js";
import { isAcuteRiskAnswer } from "../../../../packages/domain/instrument-queries.js";
import { toQuestionnaire } from "../../../../packages/instrument/index.js";
import { CrisisResponse } from "./CrisisResponse";
import type {
  ResolvePatientAccessLink,
  SubmitPatientResponse,
} from "./resolvePatientAccessLink";

export interface CompletionPageProps {
  /** The token presented in the Access-link URL, or `null` if none was given. */
  readonly token: string | null;
  /** The account-less "open" seam - injectable so tests never hit the network. */
  readonly resolve: ResolvePatientAccessLink;
  /**
   * The "submit" seam: POSTs token + answers to the Access-link Bot, which
   * validates + re-checks completeness + atomically consumes server-side (#17).
   * Injectable so tests never hit the network.
   */
  readonly submit: SubmitPatientResponse;
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
  submit,
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
            : // A used link is no longer available, like an expired one - same
              // friendly page (FR-8/FR-11).
              { kind: result.status === "used" ? "expired" : result.status }
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

  return (
    <InstrumentForm
      instrument={state.instrument}
      token={token}
      submit={submit}
    />
  );
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

/** The submit phase of the form: idle, in-flight, failed (retryable), or done. */
type SubmitPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "error" };

function InstrumentForm({
  instrument,
  token,
  submit,
}: {
  readonly instrument: Instrument;
  readonly token: string | null;
  readonly submit: SubmitPatientResponse;
}): JSX.Element {
  const questionnaire = useMemo(
    () => toQuestionnaire(instrument),
    [instrument]
  );
  const [answers, setAnswers] = useState<
    Record<string, QuestionnaireResponseItemAnswer>
  >({});
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [outcome, setOutcome] = useState<"submitted" | "unavailable" | null>(
    null
  );

  function handleChange(response: QuestionnaireResponse): void {
    // `QuestionnaireForm` fires `onChange` synchronously during its own initial
    // render; deferring the state update keeps React from warning about a
    // setState during another component's render (and is harmless for the
    // user-driven changes that follow).
    queueMicrotask(() => {
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
    });
  }

  const isComplete = instrument.items.every(
    (item) => answers[item.linkId] !== undefined
  );

  async function handleSubmit(): Promise<void> {
    if (!token || !isComplete) {
      return;
    }
    setPhase({ kind: "submitting" });
    try {
      const responseAnswers: ResponseAnswer[] = instrument.items.flatMap(
        (item) => {
          const answerCode = answers[item.linkId]?.valueCoding?.code;
          return answerCode ? [{ linkId: item.linkId, answerCode }] : [];
        }
      );
      const result = await submit({ token, answers: responseAnswers });
      if (result.status === "submitted") {
        setOutcome("submitted");
      } else {
        // used / expired / not-found / incomplete: the link can no longer be
        // completed here - show the friendly terminal page (FR-8/FR-11).
        setOutcome("unavailable");
      }
    } catch {
      setPhase({ kind: "error" });
    }
  }

  if (outcome === "submitted") {
    return <SubmittedPage />;
  }
  if (outcome === "unavailable") {
    return <FriendlyStatusPage kind="expired" />;
  }

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

        {phase.kind === "error" && (
          <Text c="red" size="sm" role="alert">
            We couldn't submit your answers just now. Please try again.
          </Text>
        )}

        <Button
          disabled={!isComplete || phase.kind === "submitting"}
          loading={phase.kind === "submitting"}
          onClick={() => void handleSubmit()}
          style={{ alignSelf: "flex-start" }}
        >
          Submit
        </Button>
      </Stack>
    </Container>
  );
}

function SubmittedPage(): JSX.Element {
  return (
    <FullPageCenter>
      <Container size="xs">
        <Stack gap="sm" ta="center">
          <Title order={2}>Thank you - your answers were submitted</Title>
          <Text c="dimmed">
            Your care coordinator will follow up with you. You can close this
            page now.
          </Text>
        </Stack>
      </Container>
    </FullPageCenter>
  );
}
