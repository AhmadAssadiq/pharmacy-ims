import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMedications } from '../../api/medications';
import { fetchRecentSales, previewSale, recordSale } from '../../api/sales';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useI18n } from '../../i18n/I18nContext';
import constants from '../../../../shared/constants.json';

/**
 * Dispensing counter. A sale is a basket of one or more medications; completing
 * it depletes each medication's lot closest to expiry first (FEFO) and writes
 * the transaction into the sales history the forecasting model trains on.
 */
export default function StaffSellPage() {
  const { t, te, formatDate, formatPrice } = useI18n();
  const [medications, setMedications] = useState([]);
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
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

  const load = useCallback(async () => {
    const [medicationData, salesData] = await Promise.all([fetchMedications(), fetchRecentSales()]);
    setMedications(medicationData.medications);
    setSales(salesData.sales);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(te(err)))
      .finally(() => setLoading(false));
    // Loads once; a language switch must not refetch the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const selected = medications.find((m) => String(m.id) === String(medicationId)) || null;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  /** "2 medications · 5 units", with the unit count optionally set as a number cell. */
  const summary = (unitsAsNum) =>
    t('sell.summary', {
      medications: t('common.medications', { count: items.length }),
      units: unitsAsNum
        ? t('common.units', { count: <span className="num">{totalQuantity}</span>, n: totalQuantity })
        : t('common.units', { count: totalQuantity }),
    });

  /**
   * Adds a line, previewing the lots it will draw from. A medication already in
   * the basket has its quantity merged, matching how the server allocates stock.
   */
  const handleAddLine = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setNotice(null);

    const medication = medications.find((m) => String(m.id) === String(medicationId));
    if (!medication) {
      setFieldErrors({ medication_id: t('sell.errorSelectFirst') });
      return;
    }
    const requested = Number(quantity);
    if (!Number.isInteger(requested) || requested <= 0) {
      setFieldErrors({ quantity: t('sell.errorQuantityMin') });
      return;
    }

    const existing = items.find((item) => item.medication_id === medication.id);
    const merged = (existing?.quantity || 0) + requested;

    setAdding(true);
    try {
      const { preview } = await previewSale(medication.id, merged);
      if (preview.shortfall > 0) {
        setFieldErrors({
          quantity: existing
            ? t('sell.errorOnlyAvailableWithExisting', {
              count: preview.available,
              name: medication.name,
              existing: existing.quantity,
            })
            : t('sell.errorOnlyAvailable', { count: preview.available, name: medication.name }),
        });
        return;
      }

      const line = {
        medication_id: medication.id,
        medication_name: medication.name,
        unit_price: Number(medication.unit_price),
        quantity: merged,
        allocations: preview.allocations,
      };
      setItems((prev) =>
        existing ? prev.map((item) => (item.medication_id === medication.id ? line : item)) : [...prev, line]
      );
      setMedicationId('');
      setQuantity('1');
    } catch (err) {
      setError(te(err));
    } finally {
      setAdding(false);
    }
  };

  const removeLine = (id) => setItems((prev) => prev.filter((item) => item.medication_id !== id));

  // Move the keyboard to the error, rather than leaving it at the bottom of the page.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  /* Dispensing is irreversible, so it is the one action behind a gate. */
  const handleSubmit = async () => {
    setError(null);
    setFieldErrors({});
    setNotice(null);
    setConfirming(false);

    if (items.length === 0) {
      setError(t('sell.errorEmpty'));
      return;
    }

    setSaving(true);
    try {
      const data = await recordSale({
        items: items.map(({ medication_id, quantity: qty }) => ({ medication_id, quantity: qty })),
      });
      const { sale } = data;
      setNotice(
        t('sell.dispensed', {
          units: t('common.units', { count: sale.total_quantity }),
          medications: t('common.medications', { count: sale.lines.length }),
          total: formatPrice(sale.total_price),
        })
      );
      setItems([]);
      await load();
    } catch (err) {
      setError(te(err));
      // A coded shortfall is fully described by the banner; its English detail would repeat it.
      if (err.code !== constants.ERROR_CODES.STOCK_INSUFFICIENT) setFieldErrors(err.details || {});
    } finally {
      setSaving(false);
    }
  };

  const lotLine = (line) =>
    t('sell.lotLine', {
      take: <span className="num">{line.take}</span>,
      date: <span className="date">{formatDate(line.expiry_date)}</span>,
    });

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
              <select value={medicationId} onChange={(e) => setMedicationId(e.target.value)}>
                <option value="">{t('sell.selectMedication')}</option>
                {medications.map((med) => (
                  <option key={med.id} value={med.id} disabled={med.quantity <= 0}>
                    {t(med.quantity <= 0 ? 'sell.optionUnavailable' : 'sell.option', {
                      name: med.name,
                      quantity: med.quantity,
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
                max={selected ? selected.quantity : undefined}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={fieldErrors.quantity ? 'true' : undefined}
                aria-describedby={selected ? 'qty-available' : undefined}
              />
              {selected && (
                <span className="field__hint" id="qty-available">
                  {t('sell.available', { count: <span className="num">{selected.quantity}</span> })}
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

      <div className="card">
        <div className="card__header">
          <h2>{t('sell.current')}</h2>
          {items.length > 0 && <span className="card__note">{t('sell.checkNote')}</span>}
        </div>
        {fieldErrors.items && <div className="alert alert--error" role="alert">{fieldErrors.items}</div>}

        {items.length === 0 ? (
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
                  {items.map((item) => (
                    <tr key={item.medication_id}>
                      <th scope="row" style={{ fontWeight: 500 }}><bdi>{item.medication_name}</bdi></th>
                      <td className="num">{item.quantity}</td>
                      <td>
                        <ul className="sale-preview__list">
                          {item.allocations.map((line) => (
                            <li key={line.batch_id}>
                              {lotLine(line)}
                              <span className="muted">
                                {' '}
                                {t('sell.leftAfter', { count: <span className="num">{line.remaining_after}</span> })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num">{formatPrice(item.unit_price * item.quantity)}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => removeLine(item.medication_id)}
                        >
                          {t('common.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sale-total">
              <span>{summary(false)}</span>
              <span className="sale-total__value">{t('common.total', { amount: formatPrice(totalPrice) })}</span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn--commit"
                onClick={() => setConfirming(true)}
                disabled={saving}
              >
                {t('sell.review')}
              </button>
              <button type="button" className="btn" onClick={() => setItems([])} disabled={saving}>
                {t('sell.clear')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <h2>{t('sell.recent')}</h2>
          <span className="card__note">{t('sell.recentNote')}</span>
        </div>
        {sales.length === 0 ? (
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
                {sales.map((sale) => (
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

      <ConfirmDialog
        open={confirming}
        title={t('sell.confirmTitle')}
        lead={t('sell.confirmLead')}
        confirmLabel={t('sell.confirmButton', { count: totalQuantity })}
        cancelLabel={t('sell.goBack')}
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={handleSubmit}
      >
        <ul className="modal__list">
          {items.map((item) => (
            <li key={item.medication_id} className="modal__line">
              <span>
                <bdi>{item.medication_name}</bdi>
                {item.allocations.map((line) => (
                  <span className="modal__lot" key={line.batch_id}>
                    {lotLine(line)}
                  </span>
                ))}
              </span>
              <span className="modal__qty">{item.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="sale-total" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <span>{summary(true)}</span>
          <span className="sale-total__value">{t('common.total', { amount: formatPrice(totalPrice) })}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
