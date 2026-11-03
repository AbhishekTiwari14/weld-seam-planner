import fixture from '../fixtures/planning-document.json';
import { planningDocumentSchema } from '../src/domain/contracts';

export function samplePlan() { return planningDocumentSchema.parse(fixture); }
export const sampleSeamId = fixture.content.sequence[0]!;
export function testId(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}
