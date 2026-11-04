import { ClientError } from "./errors.ts";

export type Budget = {
  beforeCall(maxCredits: number): void;
  spend(credits: number): void;
  left(): number;
};

export function createBudget(totalCredits: number): Budget {
  let spent = 0;
  const left = () => totalCredits - spent;
  return {
    left,
    beforeCall(maxCredits) {
      if (left() < maxCredits) {
        throw new ClientError("budget_exceeded", `${left()} credits left, call may cost ${maxCredits}`);
      }
    },
    spend(credits) {
      spent += credits;
    },
  };
}
