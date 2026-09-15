import React from "react";
import { Clock3, Power, ShieldCheck } from "lucide-react";

export default function OperationsAdmin({
  settings,
  saveOperations,
  statusSaving,
  hours,
  setHours,
  saveHour,
}) {
  const controls = [
    [
      "isOpen",
      "Loja aberta",
      "Ao abrir manualmente, a loja permanece aberta até o próximo horário de fechamento configurado.",
      settings?.isOpen,
    ],
    [
      "deliveryEnabled",
      "Entrega disponível",
      "Mostra e aceita a opção de entrega no checkout.",
      settings?.deliveryEnabled,
    ],
    [
      "pickupEnabled",
      "Retirada disponível",
      "Mostra e aceita a retirada diretamente na loja.",
      settings?.pickupEnabled,
    ],
    [
      "schedulingEnabled",
      "Agendamento disponível",
      "Permite que clientes reservem uma entrega futura. Se a loja estiver fechada, esta opção decide se ainda é possível comprar agendando.",
      settings?.schedulingEnabled,
    ],
  ];

  return (
    <>
      <section className="admin-panel operations-admin">
        <div className="panel-title">
          <div>
            <span>Controle rápido</span>
            <h2>Operação da loja</h2>
            <p>
              Esses comandos foram separados das configurações gerais para a
              equipe alterar o funcionamento do dia com segurança.
            </p>
          </div>
          <Power />
        </div>
        <div className="operation-control-grid">
          {controls.map(([key, title, description, value]) => (
            <article key={key} className={value ? "enabled" : "disabled"}>
              <span className={`operation-light ${value ? "on" : "off"}`} />
              <div>
                <b>{title}</b>
                <small>{description}</small>
              </div>
              <button
                type="button"
                disabled={statusSaving}
                className={value ? "operation-toggle active" : "operation-toggle"}
                onClick={() => saveOperations({ [key]: !value })}
              >
                {statusSaving ? "Salvando..." : value ? "Ativo" : "Desativado"}
              </button>
            </article>
          ))}
        </div>
        <div className="operation-tip">
          <ShieldCheck />
          <span>
            <b>Alteração imediata</b>
            <small>
              O estado salvo aqui é persistido no banco e refletido no site
              público.
            </small>
          </span>
        </div>
      </section>
      <StoreHoursEditor
        hours={hours}
        setHours={setHours}
        saveHour={saveHour}
      />
    </>
  );
}

function StoreHoursEditor({ hours = [], setHours, saveHour }) {
  return (
    <section className="admin-panel hours-panel operations-hours-panel">
      <div className="panel-title">
        <div>
          <span>Horário público</span>
          <h2>Funcionamento por dia</h2>
          <p>
            Estes horários informam o cliente e validam os agendamentos quando
            a loja estiver fechada.
          </p>
        </div>
        <Clock3 />
      </div>
      <div className="hours-admin-list">
        {hours.map((hour) => (
          <article key={hour.id}>
            <b>{hour.label}</b>
            <label>
              <span>Abre</span>
              <input
                type="time"
                value={hour.openTime}
                disabled={hour.closed}
                onChange={(event) =>
                  setHours((rows) =>
                    rows.map((row) =>
                      row.id === hour.id
                        ? { ...row, openTime: event.target.value }
                        : row,
                    ),
                  )
                }
                onBlur={(event) =>
                  saveHour(hour, { openTime: event.target.value })
                }
              />
            </label>
            <label>
              <span>Fecha</span>
              <input
                type="time"
                value={hour.closeTime}
                disabled={hour.closed}
                onChange={(event) =>
                  setHours((rows) =>
                    rows.map((row) =>
                      row.id === hour.id
                        ? { ...row, closeTime: event.target.value }
                        : row,
                    ),
                  )
                }
                onBlur={(event) =>
                  saveHour(hour, { closeTime: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className={hour.closed ? "area-toggle" : "area-toggle active"}
              onClick={() => saveHour(hour, { closed: !hour.closed })}
            >
              {hour.closed ? "Fechado" : "Aberto"}
            </button>
          </article>
        ))}
      </div>
      <p className="field-note">
        Altere o horário e clique fora do campo para salvar. O botão define se
        aquele dia aceita agendamento.
      </p>
    </section>
  );
}
