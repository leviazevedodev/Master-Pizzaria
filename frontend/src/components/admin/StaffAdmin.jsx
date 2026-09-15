import React, { useState } from "react";
import {
  Armchair,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import MotoIcon from "../MotoIcon";
import { formatPhoneSimple } from "../../lib/adminOrders";

const ROLE_PERMISSIONS = Object.freeze({
  DELIVERY: ["orders"],
  WAITER: ["tables", "orders"],
});

function permissionsForRole(role, current) {
  return ROLE_PERMISSIONS[role] || current;
}

export default function StaffAdmin({
  staff,
  form,
  setForm,
  createStaff,
  updateStaff,
  disableStaff,
  deleteStaff,
  generatePassword,
  permissionOptions,
}) {
  const [showPassword, setShowPassword] = useState(false);

  function toggleFormPermission(permission) {
    setForm({
      ...form,
      permissions: form.permissions.includes(permission)
        ? form.permissions.filter((item) => item !== permission)
        : [...form.permissions, permission],
    });
  }

  function toggleRowPermission(row, permission) {
    const current = Array.isArray(row.adminPermissions)
      ? row.adminPermissions
      : [];
    updateStaff(row, {
      permissions: current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    });
  }

  return (
    <div className="staff-admin-layout">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Equipe</span>
            <h2>Funcionários com acesso</h2>
            <p>Cada conta enxerga somente as abas liberadas pelo proprietário.</p>
          </div>
          <b>{staff.length}</b>
        </div>
        <div className="staff-list">
          {staff.length ? (
            staff.map((row) => (
              <article key={row.id} className={!row.staffActive ? "disabled" : ""}>
                <div className="staff-identity">
                  <span className="staff-avatar">
                    {String(row.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>{row.name}</b>
                    <small>
                      {row.email}
                      {row.phone ? ` • ${formatPhoneSimple(row.phone)}` : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={row.staffActive ? "staff-state active" : "staff-state"}
                    onClick={() => updateStaff(row, { staffActive: !row.staffActive })}
                  >
                    {row.staffActive ? "Acesso ativo" : "Acesso bloqueado"}
                  </button>
                </div>

                <div className="staff-role-row">
                  <label>
                    Função
                    <select
                      value={row.staffRole || "STAFF"}
                      onChange={(event) => {
                        const staffRole = event.target.value;
                        updateStaff(row, {
                          staffRole,
                          permissions: permissionsForRole(
                            staffRole,
                            row.adminPermissions || [],
                          ),
                        });
                      }}
                    >
                      <option value="STAFF">Funcionário</option>
                      <option value="WAITER">Garçom</option>
                      <option value="DELIVERY">Entregador</option>
                    </select>
                  </label>
                  {row.staffRole === "DELIVERY" && (
                    <span className="delivery-role-note">
                      <MotoIcon size={15} /> Acessa Pedidos para aceitar entregas
                      disponíveis e concluir as próprias entregas.
                    </span>
                  )}
                  {row.staffRole === "WAITER" && (
                    <span className="delivery-role-note">
                      <Armchair size={15} /> Acessa Mesas e, em Pedidos, somente
                      os presenciais prontos para servir.
                    </span>
                  )}
                </div>

                {row.staffRole === "STAFF" && (
                  <div className="staff-permissions">
                    <small>Permissões</small>
                    <div>
                      {permissionOptions.map(({ permission, Icon, label }) => (
                        <label
                          key={permission}
                          className={
                            row.adminPermissions?.includes(permission)
                              ? "selected"
                              : ""
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(
                              row.adminPermissions?.includes(permission),
                            )}
                            onChange={() => toggleRowPermission(row, permission)}
                          />
                          <Icon size={15} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="staff-actions">
                  <button
                    type="button"
                    className="ghost-dark-btn"
                    onClick={() => {
                      const password = window.prompt(
                        `Nova senha temporária para ${row.name}:`,
                      );
                      if (password) updateStaff(row, { password });
                    }}
                  >
                    <KeyRound size={15} /> Redefinir senha
                  </button>
                  {row.staffActive && (
                    <button
                      type="button"
                      className="ghost-dark-btn staff-disable"
                      onClick={() => disableStaff(row)}
                    >
                      Desativar
                    </button>
                  )}
                  <button
                    type="button"
                    className="subtle-danger staff-delete"
                    onClick={() => deleteStaff(row)}
                  >
                    <Trash2 size={15} /> Excluir
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-admin">
              <Users />
              <p>Nenhum funcionário criado.</p>
            </div>
          )}
        </div>
      </section>

      <form
        className="admin-panel compact-form staff-create-form"
        onSubmit={createStaff}
      >
        <div className="panel-title">
          <div>
            <span>Novo acesso</span>
            <h2>Criar funcionário</h2>
          </div>
          <ShieldCheck />
        </div>
        <label>
          Nome
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          E-mail
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Telefone
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
        <label>
          Função
          <select
            value={form.staffRole || "STAFF"}
            onChange={(event) => {
              const staffRole = event.target.value;
              setForm({
                ...form,
                staffRole,
                permissions: permissionsForRole(staffRole, form.permissions),
              });
            }}
          >
            <option value="STAFF">Funcionário</option>
            <option value="WAITER">Garçom</option>
            <option value="DELIVERY">Entregador</option>
          </select>
        </label>
        <label>
          Senha temporária
          <div className="password-generate-field">
            <input
              required
              type={showPassword ? "text" : "password"}
              minLength="12"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button
              type="button"
              className="password-visibility"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={generatePassword}
            >
              Gerar
            </button>
          </div>
        </label>

        {form.staffRole === "STAFF" ? (
          <div className="staff-create-permissions">
            <b>Abas permitidas</b>
            <div>
              {permissionOptions.map(({ permission, Icon, label }) => (
                <label
                  key={permission}
                  className={
                    form.permissions.includes(permission) ? "selected" : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => toggleFormPermission(permission)}
                  />
                  <Icon size={15} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : form.staffRole === "DELIVERY" ? (
          <div className="delivery-role-create-note">
            <MotoIcon />
            <span>
              <b>Conta de entregador</b>
              <small>
                Acessará Pedidos para aceitar entregas disponíveis e concluir as
                próprias entregas. Pedidos presenciais ficam ocultos.
              </small>
            </span>
          </div>
        ) : (
          <div className="delivery-role-create-note">
            <Armchair />
            <span>
              <b>Conta de garçom</b>
              <small>
                Acessará Mesas para abrir comandas, lançar itens e receber
                pagamentos. Em Pedidos, verá somente os prontos para servir.
              </small>
            </span>
          </div>
        )}
        <button className="primary-btn full">
          <Plus size={16} /> Criar conta
        </button>
      </form>
    </div>
  );
}
