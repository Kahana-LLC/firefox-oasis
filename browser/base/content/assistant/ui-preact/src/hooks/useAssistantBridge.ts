import { useEffect } from "preact/hooks";
import type {
  ClarificationData,
  ConfirmationData,
  OasisWindow,
  ToolActionStatus,
} from "../types";

const oasisWindow: OasisWindow = window;

export function useAssistantBridge(params: {
  startToolAction: (name: string, messageId?: string, label?: string) => string;
  updateToolAction: (id: string, status: ToolActionStatus) => void;
  resetAssistantSession: () => void | Promise<void>;
  setPendingConfirmation: (data: ConfirmationData | null) => void;
  setPendingClarification: (data: ClarificationData | null) => void;
}) {
  const {
    startToolAction,
    updateToolAction,
    resetAssistantSession,
    setPendingConfirmation,
    setPendingClarification,
  } = params;

  useEffect(() => {
    const previousRecordStart = oasisWindow.oasisRecordToolActionStart;
    const previousRecordUpdate = oasisWindow.oasisRecordToolActionUpdate;
    const previousResetAssistantSession = oasisWindow.resetAssistantSession;
    const previousPendingRelay = oasisWindow.oasisSetPendingConfirmationRelay;
    const previousClarificationRelay =
      oasisWindow.oasisSetPendingClarificationRelay;

    oasisWindow.oasisRecordToolActionStart = (
      name: string,
      messageId?: string,
      label?: string
    ) => startToolAction(name, messageId, label);
    oasisWindow.oasisRecordToolActionUpdate = (
      id: string,
      status: ToolActionStatus
    ) => {
      updateToolAction(id, status);
    };
    oasisWindow.resetAssistantSession = () => resetAssistantSession();
    oasisWindow.oasisSetPendingConfirmationRelay = (
      data: ConfirmationData | null
    ) => {
      setPendingConfirmation(data);
    };
    oasisWindow.oasisSetPendingClarificationRelay = (
      data: ClarificationData | null
    ) => {
      setPendingClarification(data);
    };

    return () => {
      oasisWindow.oasisRecordToolActionStart = previousRecordStart;
      oasisWindow.oasisRecordToolActionUpdate = previousRecordUpdate;
      oasisWindow.resetAssistantSession = previousResetAssistantSession;
      oasisWindow.oasisSetPendingConfirmationRelay = previousPendingRelay;
      oasisWindow.oasisSetPendingClarificationRelay =
        previousClarificationRelay;
    };
  }, [
    resetAssistantSession,
    setPendingClarification,
    setPendingConfirmation,
    startToolAction,
    updateToolAction,
  ]);
}
