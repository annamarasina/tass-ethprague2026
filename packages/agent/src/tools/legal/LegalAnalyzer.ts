import type { AuditInput, EmitLog, LegalReport } from "../../interfaces";

export interface LegalAnalyzer {
  run(input: AuditInput, emit: EmitLog): Promise<LegalReport>;
}

