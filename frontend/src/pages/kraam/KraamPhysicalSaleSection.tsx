import type { CardKind, PaymentMethod } from '../../api'

export type MemberOption = { user_id: number; label: string }

type Props = {
  memberOptions: MemberOption[]
  saleUserID: number
  saleKind: CardKind
  salePaymentMethod: PaymentMethod
  saleSubmitting: boolean
  onChangeUser: (userId: number) => void
  onChangeKind: (kind: CardKind) => void
  onChangePaymentMethod: (method: PaymentMethod) => void
  onSubmit: () => void
}

export function KraamPhysicalSaleSection({
  memberOptions,
  saleUserID,
  saleKind,
  salePaymentMethod,
  saleSubmitting,
  onChangeUser,
  onChangeKind,
  onChangePaymentMethod,
  onSubmit,
}: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-indigo-200/90 bg-indigo-50/40 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-indigo-950">Fysieke kaartverkoop registreren</h2>
        <p className="text-sm text-indigo-900/85">Registreer directe verkoop (operator/admin).</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-indigo-950">Lid</span>
          <select
            value={saleUserID}
            onChange={(e) => onChangeUser(Number(e.target.value))}
            className="input-control min-h-11 rounded-xl"
          >
            <option value={0}>Kies een lid…</option>
            {memberOptions.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-indigo-950">Kaarttype</span>
          <select
            value={saleKind}
            onChange={(e) => onChangeKind(e.target.value as CardKind)}
            className="input-control min-h-11 rounded-xl"
          >
            <option value="tosti">Tostikaart</option>
            <option value="avondeten">Avondetenkaart</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-indigo-950">Betaalmiddel</span>
          <select
            value={salePaymentMethod}
            onChange={(e) => onChangePaymentMethod(e.target.value as PaymentMethod)}
            className="input-control min-h-11 rounded-xl"
          >
            <option value="tikkie">Tikkie</option>
            <option value="contant">Contant</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saleSubmitting || memberOptions.length === 0}
          onClick={() => void onSubmit()}
          className="min-h-11 rounded-xl bg-indigo-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
        >
          {saleSubmitting ? 'Bezig…' : 'Verkoop opslaan'}
        </button>
      </div>
    </section>
  )
}
