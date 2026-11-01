// A translated sentence in which some values are styled, for example a bold count:
//   "<strong>{count}</strong> medications are at or below their reorder level."
// In en.json / ar.json the styled parts are marked with these tags:
//   <num>   a number (aligned digits)      <date>  a date      <strong>  bold
// Usage:
//   <StyledText id="inventory.findingLow" count={5} />
//   <StyledText id="alerts.stockLine" values={{ quantity: 12, threshold: 15 }} />
import { Trans } from 'react-i18next';

const TAGS = {
  num: <span className="num" />,
  date: <span className="date" />,
  strong: <strong />,
};

export default function StyledText({ id, values, count }) {
  return <Trans i18nKey={id} values={values} count={count} components={TAGS} />;
}
