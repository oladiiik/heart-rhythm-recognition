import type { LabeledSequence } from '../domain/generator';
import type { EvaluationMetrics } from '../domain/metrics';
import type { EpochStatus, ModelSnapshot, TrainingConfig } from './model';

export interface TrainRequest {
  readonly type: 'train';
  readonly train: readonly LabeledSequence[];
  readonly test: readonly LabeledSequence[];
  readonly config: TrainingConfig;
}

export type WorkerRequest = TrainRequest;

export interface EpochProgress {
  readonly type: 'epoch';
  readonly epoch: number;
  readonly totalEpochs: number;
  readonly error: number;
}

export interface EvaluationProgress {
  readonly type: 'evaluating';
  readonly processed: number;
  readonly total: number;
}

export interface TrainingResult {
  readonly type: 'done';
  readonly snapshot: ModelSnapshot;
  readonly metrics: EvaluationMetrics;
  readonly history: readonly EpochStatus[];
  readonly trainMs: number;
  readonly evaluationMs: number;
}

export interface TrainingFailure {
  readonly type: 'failed';
  readonly message: string;
}

export type WorkerResponse = EpochProgress | EvaluationProgress | TrainingResult | TrainingFailure;
