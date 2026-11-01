// What valid data looks like for medications (FR 3.1) and their stock lots (UC-1).
// See validate.js for how these are used and for the field builders.
//
// Stock is kept per lot ("batch"): each delivery has its own quantity and expiry date.
// So adding a new medication checks the catalogue fields AND its first lot together,
// while editing a medication checks only the catalogue fields.
import { z } from 'zod';
import { LOW_STOCK_THRESHOLD } from '../constants.js';
import {
  requiredText,
  optionalText,
  priceField,
  wholeNumber,
  optionalWholeNumber,
  requiredDate,
} from './validate.js';

// The catalogue fields of a medication
const catalogFields = {
  name: requiredText('Name', 150),
  category: requiredText('Category', 100),
  unit_price: priceField('Unit price'),
  supplier_info: requiredText('Supplier information', 255),
  // Optional: when left empty the shared default (10) is used
  low_stock_threshold: optionalWholeNumber({
    min: 0,
    defaultValue: LOW_STOCK_THRESHOLD,
    messages: {
      notWhole: 'Reorder threshold must be a whole number',
      tooSmall: 'Reorder threshold cannot be negative',
    },
  }),
};

// The fields of one stock lot
const batchFields = {
  quantity: wholeNumber({
    min: 0,
    messages: {
      required: 'Quantity is required',
      notWhole: 'Quantity must be a whole number',
      tooSmall: 'Quantity cannot be negative',
    },
  }),
  expiry_date: requiredDate('Expiry date'),
  batch_number: optionalText('Batch number', 60),
};

// Editing a medication: catalogue fields only
export const medicationSchema = z.object(catalogFields);

// Adding or correcting a stock lot
export const batchSchema = z.object(batchFields);

// Adding a new medication: catalogue fields plus its first stock lot
export const newMedicationSchema = z.object({ ...catalogFields, ...batchFields });
