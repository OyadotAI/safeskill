export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type DetectorCategory =
  | 'filesystem-access'
  | 'network-access'
  | 'env-access'
  | 'process-spawn'
  | 'crypto-usage'
  | 'obfuscation'
  | 'install-scripts'
  | 'dynamic-require';

export type PromptDetectorCategory =
  | 'instruction-override'
  | 'hidden-text'
  | 'data-exfiltration-prompt'
  | 'tool-abuse'
  | 'persona-hijack'
  | 'cot-manipulation'
  | 'delimiter-escape'
  | 'indirect-injection';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface CodeFinding {
  category: DetectorCategory;
  severity: Severity;
  location: SourceLocation;
  description: string;
  codeSnippet: string;
  confidence: number; // 0-1
  isTestFixture?: boolean; // true when finding is inside a test/fixture/golden directory
}

export interface PromptFinding {
  category: PromptDetectorCategory;
  severity: Severity;
  location: SourceLocation;
  description: string;
  contentSnippet: string;
  confidence: number; // 0-1
  technique: string; // e.g. "unicode-smuggling", "instruction-pattern"
  isTestFixture?: boolean; // true when finding is inside a test/fixture/golden directory
}

export interface TaintFlow {
  source: {
    type: string; // e.g. "fs.readFile", "process.env"
    location: SourceLocation;
    description: string;
  };
  sink: {
    type: string; // e.g. "fetch", "http.request"
    location: SourceLocation;
    description: string;
  };
  intermediateSteps: Array<{
    description: string;
    location: SourceLocation;
  }>;
  severity: Severity;
}

export interface MismatchFinding {
  claimed: string; // what the content says
  actual: string; // what the code does
  contentLocation: SourceLocation;
  codeLocation: SourceLocation;
  severity: Severity;
  description: string;
}

export interface ScanResult {
  packageName: string;
  packageVersion: string | null;
  scanId: string;
  timestamp: number;
  duration: number; // ms

  // Scores
  overallScore: number; // 0-100
  codeScore: number; // 0-100
  contentScore: number; // 0-100
  scoreBreakdown: ScoreBreakdown;

  // Findings
  codeFindings: CodeFinding[];
  promptFindings: PromptFinding[];
  taintFlows: TaintFlow[];
  mismatches: MismatchFinding[];

  // Inferred permissions
  permissions: PermissionManifest;

  // Metadata
  filesScanned: number;
  contentFilesScanned: number;
  dependencyCount: number;
  hasInstallScripts: boolean;
}

export interface ScoreBreakdown {
  dataFlowRisks: number; // 0-25
  promptInjectionRisks: number; // 0-20
  dangerousApis: number; // 0-15
  descriptionMismatch: number; // 0-10
  networkBehavior: number; // 0-10
  dependencyHealth: number; // 0-8
  transparency: number; // 0-7
  codeQuality: number; // 0-5
}

export interface PermissionManifest {
  filesystem: {
    read: string[];
    write: string[];
    delete: string[];
  };
  network: {
    outbound: string[];
    inbound: boolean;
    domains: string[];
  };
  environment: {
    variables: string[];
    bulkAccess: boolean;
  };
  process: {
    spawn: boolean;
    commands: string[];
  };
  system: {
    crypto: boolean;
    nativeModules: boolean;
    installScripts: string[];
  };
  dataFlows: TaintFlow[];
  promptRisks: {
    injectionAttempts: PromptFinding[];
    hiddenContent: PromptFinding[];
    descriptionMismatches: MismatchFinding[];
    manipulationPatterns: PromptFinding[];
  };
}
