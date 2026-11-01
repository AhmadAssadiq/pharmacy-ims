// The dispensing counter (selling medications).
// Staff build a "basket" of one or more medications, check it, and confirm.
// Confirming takes the units from the lots that expire first (FEFO) and records the sale in
// the sales history, which the forecast learns from.
import { useEffect, useRef, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchRecentSales, previewSale, recordSale } from '../../api/sales';
import ConfirmDialog from '../../components/ConfirmDialog';
import StyledText from '../../components/StyledText';
import { useI18n } from '../../i18n/useI18n';
import constants from '../../../../shared/constants.json';

export default function StaffSellPage() {
  const { t, te, formatDate, formatPrice } = useI18n();
  const [medications, setMedications] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  // The basket: [{ medication_id, medication_name, unit_price, quantity, allocations }]
  const [basket, setBasket] = useState([]);
  // The "add a medication" form
  const [medicationId, setMedicationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef(null);

  // Loads the medications (for the drop-down) and the recent sales
  async function loadData() {
    const medicationData = await fetchMedications();
    const salesData = await fetchRecentSales();
    setMedications(medicationData.medications);
    setRecentSales(salesData.sales);
  }

  // Load once when the page opens
  useEffect(() => {
    loadData()
      .catch((loadError) => setError(te(loadError)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When an error appears, move the keyboard focus to it (instead of leaving it at the bottom)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const selectedMedication = medications.find((medication) => String(medication.id) === String(medicationId));

  // Totals of the basket
  let totalQuantity = 0;
  let totalPrice = 0;
  for (const line of basket) {
    totalQuantity += line.quantity;
    totalPrice += line.unit_price * line.quantity;
  }

  // Adds a medication to the basket. First asks the server which lots it would come from
  // (nothing is sold yet). A medication already in the basket gets its quantity added on.
  async function handleAddLine(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setNotice(null);

    // Check the form first
    if (!selectedMedication) {
      setFieldErrors({ medication_id: t('sell.errorSelectFirst') });
      return;
    }
    const requested = Number(quantity);
    if (!Number.isInteger(requested) || requested <= 0) {
      setFieldErrors({ quantity: t('sell.errorQuantityMin') });
      return;
    }

    const existingLine = basket.find((line) => line.medication_id === selectedMedication.id);
    const alreadyInBasket = existingLine ? existingLine.quantity : 0;
    const newQuantity = alreadyInBasket + requested;

    setAdding(true);
    try {
      const { preview } = await previewSale(selectedMedication.id, newQuantity);

      // Not enough stock: say how many are available
      if (preview.shortfall > 0) {
        let message;
        if (existingLine) {
          message = t('sell.errorOnlyAvailableWithExisting', {
            count: preview.available,
            name: selectedMedication.name,
            existing: existingLine.quantity,
          });
        } else {
          message = t('sell.errorOnlyAvailable', { count: preview.available, name: selectedMedication.name });
        }
        setFieldErrors({ quantity: message });
        return;
      }

      const newLine = {
        medication_id: selectedMedication.id,
        medication_name: selectedMedication.name,
        unit_price: Number(selectedMedication.unit_price),
        quantity: newQuantity,
        allocations: preview.allocations,
      };
      if (existingLine) {
        setBasket(basket.map((line) => (line.medication_id === newLine.medication_id ? newLine : line)));
      } else {
        setBasket([...basket, newLine]);
      }

      // Empty the form for the next medication
      setMedicationId('');
      setQuantity('1');
    } catch (addError) {
      setError(te(addError));
    } finally {
      setAdding(false);
    }
  }

  function removeLine(id) {
    setBasket(basket.filter((line) => line.medication_id !== id));
  }

  // Sells the whole basket (after the staff member confirmed in the dialog)
  async function handleConfirmSale() {
    setError(null);
    setFieldErrors({});
    setNotice(null);
    setConfirming(false);

    if (basket.length === 0) {
      setError(t('sell.errorEmpty'));
      return;
    }

    setSaving(true);
    try {
      const lines = basket.map((line) => ({ medication_id: line.medication_id, quantity: line.quantity }));
      const { sale } = await recordSale({ items: lines });
      setNotice(
        t('sell.dispensed', {
          units: t('common.units', { count: sale.total_quantity }),
          medications: t('common.medications', { count: sale.lines.length }),
          total: formatPrice(sale.total_price),
        })
      );
      setBasket([]);
      await loadData(); // refresh stock levels and recent sales
    } catch (saleError) {
      setError(te(saleError));
      // A "not enough stock" error is already fully explained by the banner
      if (saleError.code !== constants.ERROR_CODES.STOCK_INSUFFICIENT) {
        setFieldErrors(saleError.details || {});
      }
    } finally {
      setSaving(false);
    }
  }

  // "12 from the lot expiring 09 Nov 2026"
  function lotLine(allocation) {
    return (
      <StyledText id="sell.lotLine" values={{ take: allocation.take, date: formatDate(allocation.expiry_date) }} />
    );
  }

  const totalText = t('common.total', { amount: formatPrice(totalPrice) });
  const medicationCountText = t('common.medications', { count: basket.length });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('sell.title')}</h1>
          <p className="page-finding">{t('sell.finding')}</p>
        </div>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}

      {/* 1. Add a medication to the basket */}
      <form className="card" onSubmit={handleAddLine} aria-label={t('sell.addFormLabel')}>
        <div className="card__header">
          <h2>{t('sell.addTitle')}</h2>
          <span className="card__note">{t('sell.addNote')}</span>
        </div>
        {loading ? (
          <p className="empty">{t('common.loadingCatalog')}</p>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span className="field__label">{t('common.medication')}</span>
              <select value={medicationId} onChange={(event) => setMedicationId(event.target.value)}>
                <option value="">{t('sell.selectMedication')}</option>
                {medications.map((medication) => (
                  <option key={medication.id} value={medication.id} disabled={medication.quantity <= 0}>
                    {t(medication.quantity <= 0 ? 'sell.optionUnavailable' : 'sell.option', {
                      name: medication.name,
                      quantity: medication.quantity,
                    })}
                  </option>
                ))}
              </select>
              {fieldErrors.medication_id && <span className="field__error">{fieldErrors.medication_id}</span>}
            </label>

            <label className="field">
              <span className="field__label">{t('common.quantity')}</span>
              <input
                type="number"
                min={1}
                step={1}
                max={selectedMedication ? selectedMedication.quantity : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                aria-invalid={fieldErrors.quantity ? 'true' : undefined}
                aria-describedby={selectedMedication ? 'qty-available' : undefined}
              />
              {selectedMedication && (
                <span className="field__hint" id="qty-available">
                  <StyledText id="sell.available" values={{ count: selectedMedication.quantity }} />
                </span>
              )}
              {fieldErrors.quantity && <span className="field__error">{fieldErrors.quantity}</span>}
            </label>

            <div className="field">
              <span className="field__label" aria-hidden="true">&nbsp;</span>
              <button type="submit" className="btn" disabled={adding}>
                {adding ? t('sell.checkingStock') : t('sell.add')}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* 2. The basket */}
      <div className="card">
        <div className="card__header">
          <h2>{t('sell.current')}</h2>
          {basket.length > 0 && <span className="card__note">{t('sell.checkNote')}</span>}
        </div>
        {fieldErrors.items && <div className="alert alert--error" role="alert">{fieldErrors.items}</div>}

        {basket.length === 0 ? (
          <p className="empty empty--framed">{t('sell.empty')}</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('sell.currentCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('common.medication')}</th>
                    <th scope="col" className="num">{t('common.quantity')}</th>
                    <th scope="col">{t('sell.colDrawnFrom')}</th>
                    <th scope="col" className="num">{t('sell.colLineTotal')}</th>
                    <th scope="col" className="actions">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {basket.map((line) => (
                    <tr key={line.medication_id}>
                      <th scope="row" style={{ fontWeight: 500 }}><bdi>{line.medication_name}</bdi></th>
                      <td className="num">{line.quantity}</td>
                      <td>
                        {/* Which lots the units come from, and what is left in each */}
                        <ul className="sale-preview__list">
                          {line.allocations.map((allocation) => (
                            <li key={allocation.batch_id}>
                              {lotLine(allocation)}
                              <span className="muted">
                                {' '}
                                <StyledText id="sell.leftAfter" values={{ count: allocation.remaining_after }} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num">{formatPrice(line.unit_price * line.quantity)}</td>
                      <td className="actions">
                        <button type="button" className="btn btn--sm btn--danger" onClick={() => removeLine(line.medication_id)}>
                          {t('common.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sale-total">
              <span>{t('sell.summary', { medications: medicationCountText, units: t('common.units', { count: totalQuantity }) })}</span>
              <span className="sale-total__value">{totalText}</span>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn--commit" onClick={() => setConfirming(true)} disabled={saving}>
                {t('sell.review')}
              </button>
              <button type="button" className="btn" onClick={() => setBasket([])} disabled={saving}>
                {t('sell.clear')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 3. Recent sales */}
      <div className="card">
        <div className="card__header">
          <h2>{t('sell.recent')}</h2>
          <span className="card__note">{t('sell.recentNote')}</span>
        </div>
        {recentSales.length === 0 ? (
          <p className="empty">{t('sell.noSales')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t('sell.recentCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('sell.colDate')}</th>
                  <th scope="col">{t('common.medication')}</th>
                  <th scope="col" className="num">{t('common.quantity')}</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="date">{formatDate(sale.date)}</td>
                    <td><bdi>{sale.medication_name}</bdi></td>
                    <td className="num">{sale.quantity_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selling cannot be undone, so it asks for confirmation first */}
      <ConfirmDialog
        open={confirming}
        title={t('sell.confirmTitle')}
        lead={t('sell.confirmLead')}
        confirmLabel={t('sell.confirmButton', { count: totalQuantity })}
        cancelLabel={t('sell.goBack')}
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={handleConfirmSale}
      >
        <ul className="modal__list">
          {basket.map((line) => (
            <li key={line.medication_id} className="modal__line">
              <span>
                <bdi>{line.medication_name}</bdi>
                {line.allocations.map((allocation) => (
                  <span className="modal__lot" key={allocation.batch_id}>
                    {lotLine(allocation)}
                  </span>
                ))}
              </span>
              <span className="modal__qty">{line.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="sale-total" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <span>
            {/* "2 medications · 5 units", with the unit count styled as a number */}
            {medicationCountText} · <StyledText id="sell.basketUnits" count={totalQuantity} />
          </span>
          <span className="sale-total__value">{totalText}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
