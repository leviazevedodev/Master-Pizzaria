import React, { useEffect, useState } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { api, authHeaders } from "../../../lib/api";
import { money } from "../../../lib/format";

export function DeliveryTimeRules({
  session,
  fail = () => {},
  notify = () => {},
}) {
  const headers = authHeaders(session.token);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({
    name: "Taxa noturna",
    dayOfWeek: "",
    startTime: "22:00",
    endTime: "23:59",
    amount: 2,
  });
  async function load() {
    try {
      const { data } = await api.get("/admin/delivery-surcharges", headers);
      setRules(data);
    } catch (err) {
      fail(err, "Não foi possível carregar as taxas por horário.");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/delivery-surcharges",
        {
          ...form,
          dayOfWeek: form.dayOfWeek === "" ? null : Number(form.dayOfWeek),
          amount: Number(form.amount),
        },
        headers,
      );
      setForm({ ...form, name: "", amount: 0 });
      notify("Regra de horário criada.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível criar a regra.");
    }
  }
  async function update(row, patch) {
    try {
      await api.patch(`/admin/delivery-surcharges/${row.id}`, patch, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível atualizar a regra.");
    }
  }
  async function remove(row) {
    if (!confirm(`Excluir “${row.name}”?`)) return;
    try {
      await api.delete(`/admin/delivery-surcharges/${row.id}`, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível excluir a regra.");
    }
  }
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  return (
    <section className="admin-panel delivery-time-rules">
      <div className="panel-title">
        <div>
          <span>Preço por horário</span>
          <h2>Taxa diferente por horário</h2>
          <p>
            Adicione um valor extra ao frete em horários específicos, como
            madrugada ou horário de pico.
          </p>
        </div>
        <Clock3 />
      </div>
      <div className="time-rule-list">
        {rules.map((r) => (
          <article key={r.id}>
            <div className="time-rule-identity">
              <span className="time-rule-icon">
                <Clock3 size={16} />
              </span>
              <div>
                <b>{r.name}</b>
                <small>
                  {r.dayOfWeek == null ? "Todos os dias" : days[r.dayOfWeek]} •{" "}
                  {r.startTime}–{r.endTime}
                </small>
              </div>
            </div>
            <label>
              <span>Adicional</span>
              <div className="money-field">
                <small>R$</small>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={Number(r.amount)}
                  onBlur={(e) => update(r, { amount: Number(e.target.value) })}
                />
              </div>
            </label>
            <button
              className={r.active ? "area-toggle active" : "area-toggle"}
              onClick={() => update(r, { active: !r.active })}
            >
              {r.active ? "Ativa" : "Pausada"}
            </button>
            <button
              className="subtle-danger time-rule-delete"
              onClick={() => remove(r)}
              title="Excluir regra"
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      <form className="delivery-time-create" onSubmit={create}>
        <div className="delivery-time-create-head">
          <div>
            <span>Nova regra</span>
            <b>Adicionar faixa de horário</b>
          </div>
          <Plus size={17} />
        </div>
        <div className="delivery-time-fields">
          <label>
            <span>Nome da regra</span>
            <input
              required
              placeholder="Ex.: Taxa noturna"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <span>Aplicar em</span>
            <select
              value={form.dayOfWeek}
              onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
            >
              <option value="">Todos os dias</option>
              {days.map((d, i) => (
                <option value={i} key={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Início</span>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </label>
          <label>
            <span>Término</span>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </label>
          <label>
            <span>Valor extra</span>
            <div className="money-field">
              <small>R$</small>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </label>
        </div>
        <button className="primary-btn delivery-time-submit">
          <Plus size={15} /> Adicionar regra
        </button>
      </form>
    </section>
  );
}

