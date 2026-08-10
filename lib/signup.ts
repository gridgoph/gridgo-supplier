import type { CategoryRank, SupplierSignup } from "@/lib/api";
import { findArea } from "@/data/davaoAreas";

/**
 * Opening a shop account, checked before anything is sent.
 *
 * The platform validates all of this again and is the authority — this module
 * exists so a shop is told which field is wrong while it is still looking at
 * the field, rather than being handed one server error for a whole form.
 *
 * Ranking is the part worth being careful about. The captain's model is that a
 * shop declares what it does **best first**, so the order of the list *is* the
 * data: rank is position, and nothing else records it. The platform requires
 * ranks to run 1..n with no gaps, which a reorderable list gives for free.
 */

export type SignupForm = {
  shopName: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  /** Code from `DAVAO_AREAS`. */
  areaCode: string | null;
  streetAddress: string;
  /** Category codes, best first. Position is the rank. */
  categoryCodes: string[];
};

export const EMPTY_SIGNUP_FORM: SignupForm = {
  shopName: "",
  contactName: "",
  email: "",
  phone: "",
  password: "",
  areaCode: null,
  streetAddress: "",
  categoryCodes: [],
};

export const MIN_PASSWORD_LENGTH = 8;

export type SignupField = keyof SignupForm;

/** Field → what is wrong and how to fix it. Absent means the field is fine. */
export type SignupErrors = Partial<Record<SignupField, string>>;

export function validateSignup(form: SignupForm): SignupErrors {
  const errors: SignupErrors = {};

  if (!form.shopName.trim()) {
    errors.shopName = "Enter the name clients and riders will see on your jobs.";
  }
  if (!form.contactName.trim()) {
    errors.contactName = "Enter the name of the person GRIDGO should talk to.";
  }
  if (!isEmailish(form.email)) {
    errors.email = "Enter a working email address — GRIDGO sends your job alerts to it.";
  }
  if (!isPhoneish(form.phone)) {
    errors.phone = "Enter a mobile number GRIDGO and the rider can reach you on.";
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!findArea(form.areaCode)) {
    errors.areaCode = "Pick the part of Davao your shop works out of.";
  }
  if (!form.streetAddress.trim()) {
    errors.streetAddress = "Enter the street a rider will collect from.";
  }
  if (!form.categoryCodes.length) {
    errors.categoryCodes = "Pick at least one kind of work, starting with what you do best.";
  }

  return errors;
}

export function hasErrors(errors: SignupErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Position becomes rank: first in the list is what the shop does best. */
export function categoryRanks(categoryCodes: string[]): CategoryRank[] {
  return categoryCodes.map((categoryCode, index) => ({ categoryCode, rank: index + 1 }));
}

/**
 * The form as the platform wants it. Only call this on a form that validates —
 * the area is looked up rather than trusted, so an unknown one cannot become a
 * shop pinned at the origin of the map.
 */
export function toSignupRequest(form: SignupForm): SupplierSignup | null {
  const area = findArea(form.areaCode);
  if (!area) return null;

  return {
    email: form.email.trim(),
    password: form.password,
    name: form.contactName.trim(),
    phone: form.phone.trim(),
    supplierName: form.shopName.trim(),
    shop: {
      lat: area.lat,
      lng: area.lng,
      label: `${form.streetAddress.trim()}, ${area.name}, Davao City`,
    },
    categoryRanks: categoryRanks(form.categoryCodes),
  };
}

/** Move a category one place towards "best". Ranks renumber themselves. */
export function promoteCategory(codes: string[], code: string): string[] {
  const index = codes.indexOf(code);
  if (index <= 0) return codes;
  const next = [...codes];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

export function toggleCategory(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
}

/** Deliberately loose: the platform is the authority, this catches typos. */
function isEmailish(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Any number a Philippine mobile could be, without rejecting a valid format. */
function isPhoneish(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 10;
}
