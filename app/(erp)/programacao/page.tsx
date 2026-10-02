"use client";

import { useState } from "react";
import {
  ChevronRight,
  FileSpreadsheet,
  FileText,
  UploadCloud,
} from "lucide-react";

import type {
  ImportResult,
} from "@/types/pcp";

import {
  useOps,
} from "@/components/operational-provider";

import {
  Panel,
} from "@/components/ui";

import {
  LABELS,
} from "@/lib/metrics";

import {
  modeloProduto,
} from "@/lib/presentation";

export default function Programacao() {
  const {
    refresh,
    toast,
  } = useOps();

  const [
    mode,
    setMode,
  ] = useState<
    "FILTRO" | "PEDIDO"
  >("FILTRO");

  const [
    filter,
    setFilter,
  ] = useState<File | null>(
    null
  );

  const [
    pedido,
    setPedido,
  ] = useState<File | null>(
    null
  );

  const [
    usinagem,
    setUsinagem,
  ] = useState<File | null>(
    null
  );

  const [
    draft,
    setDraft,
  ] = useState<
    ImportResult | null
  >(null);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    data,
    setData,
  ] = useState(
    new Date()
      .toISOString()
      .slice(
        0,
        10
      )
  );

  const [
    turno,
    setTurno,
  ] = useState("A");

  async function process() {
    setBusy(true);

    try {
      const fd =
        new FormData();

      let ep = "";

      if (
        mode === "FILTRO"
      ) {
        if (!filter) {
          throw new Error(
            "Selecione o CSV do filtro."
          );
        }

        fd.append(
          "filtro",
          filter
        );

        ep =
          "/api/importar/filtro";
      } else {
        if (
          !pedido ||
          !usinagem
        ) {
          throw new Error(
            "Selecione Pedido e Usinagem."
          );
        }

        fd.append(
          "pedido",
          pedido
        );

        fd.append(
          "usinagem",
          usinagem
        );

        ep =
          "/api/importar/pedido";
      }

      const r =
        await fetch(
          ep,
          {
            method:
              "POST",
            body: fd,
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error
        );
      }

      setDraft(j);

      toast(
        "success",
        "Arquivo interpretado. Revise os dados antes de liberar."
      );
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!draft) {
      return;
    }

    setBusy(true);

    try {
      const r =
        await fetch(
          "/api/programacoes",
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  filtro:
                    draft.filtro,

                  data,

                  turno,

                  origem:
                    mode,

                  diagnostico:
                    {
                      linhas:
                        draft.linhas,

                      pedidos:
                        draft.pedidos,

                      ofs:
                        draft.ofs,

                      pecas:
                        draft.pecas,

                      operacoes:
                        draft.operacoes,

                      semRota:
                        draft.semRota,

                      inconsistenciasRota:
                        draft.inconsistenciasRota,

                      processos:
                        draft.processos,
                    },

                  produtos:
                    draft.produtos,
                }
              ),
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error
        );
      }

      toast(
        "success",
        "Programação liberada para a fábrica."
      );

      setDraft(null);

      await refresh();
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>
            PLANEJAMENTO
          </span>

          <h1>
            Programação
            do Dia
          </h1>

          <p>
            Importação
            revisada antes
            da liberação
            para o chão
            de fábrica.
          </p>
        </div>
      </div>

      {!draft ? (
        <div className="planning">
          <Panel
            title="Fonte da programação"
            subtitle="Filtro do Consistem é a fonte principal"
          >
            <div className="sourceTabs">
              <button
                className={
                  mode ===
                  "FILTRO"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setMode(
                    "FILTRO"
                  )
                }
              >
                <FileSpreadsheet />

                <span>
                  <b>
                    Filtro
                    do
                    Consistem
                  </b>

                  <small>
                    RECOMENDADO
                    • rota
                    real
                  </small>
                </span>
              </button>

              <button
                className={
                  mode ===
                  "PEDIDO"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setMode(
                    "PEDIDO"
                  )
                }
              >
                <FileText />

                <span>
                  <b>
                    Pedido
                    +
                    Usinagem
                  </b>

                  <small>
                    modo
                    secundário
                  </small>
                </span>
              </button>
            </div>

            {mode ===
            "FILTRO" ? (
              <Drop
                file={
                  filter
                }
                set={
                  setFilter
                }
                accept=".csv"
                title="CSV do filtro diário"
              />
            ) : (
              <div className="doubleDrop">
                <Drop
                  file={
                    pedido
                  }
                  set={
                    setPedido
                  }
                  accept=".pdf"
                  title="Pedido desmembrado"
                />

                <Drop
                  file={
                    usinagem
                  }
                  set={
                    setUsinagem
                  }
                  accept=".xls,.xlsx"
                  title="Usinagem"
                />
              </div>
            )}

            <div className="formRow">
              <label>
                Data

                <input
                  type="date"
                  value={
                    data
                  }
                  onChange={(
                    e
                  ) =>
                    setData(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                Turno

                <select
                  value={
                    turno
                  }
                  onChange={(
                    e
                  ) =>
                    setTurno(
                      e.target
                        .value
                    )
                  }
                >
                  <option>
                    A
                  </option>

                  <option>
                    B
                  </option>

                  <option>
                    A + B
                  </option>
                </select>
              </label>
            </div>

            <div className="panelActions">
              <button
                className="primary"
                disabled={
                  busy
                }
                onClick={
                  process
                }
              >
                {busy ? (
                  "PROCESSANDO..."
                ) : (
                  <>
                    PROCESSAR

                    <ChevronRight />
                  </>
                )}
              </button>
            </div>
          </Panel>

          <Panel
            title="Validações da importação"
            subtitle="As divergências ficam visíveis antes da liberação"
          >
            <ul className="checks">
              <li>
                N/A,
                vazio,
                hífen
                e N/D
                não
                pertencem
                à rota.
              </li>

              <li>
                0 =
                pendente;
                1–99,99 =
                parcial;
                100 =
                concluído.
              </li>

              <li>
                O conteúdo
                do filtro
                pode mudar
                diariamente
                com novos
                pedidos,
                reposições
                e
                alterações
                de
                produção.
              </li>

              <li>
                Itens sem
                rota e
                inconsistências
                ficam
                visíveis
                para
                revisão,
                sem
                bloquear
                automaticamente
                a
                programação.
              </li>
            </ul>
          </Panel>
        </div>
      ) : (
        <Review
          d={
            draft
          }
          busy={
            busy
          }
          back={() =>
            setDraft(
              null
            )
          }
          release={
            release
          }
        />
      )}
    </>
  );
}

function Drop({
  file,
  set,
  accept,
  title,
}: any) {
  return (
    <label
      className={`drop ${
        file
          ? "ready"
          : ""
      }`}
    >
      <UploadCloud />

      <span>
        <b>
          {file?.name ||
            title}
        </b>

        <small>
          {file
            ? `${(
                file.size /
                1024 /
                1024
              ).toFixed(
                2
              )} MB`
            : accept}
        </small>
      </span>

      <input
        type="file"
        accept={
          accept
        }
        onChange={(
          e
        ) =>
          set(
            e.target
              .files?.[0] ||
              null
          )
        }
      />
    </label>
  );
}

function Review({
  d,
  busy,
  back,
  release,
}: {
  d: ImportResult;
  busy: boolean;
  back: () => void;
  release: () => void;
}) {
  const hasWarnings =
    d.semRota > 0 ||
    d.inconsistenciasRota >
      0;

  return (
    <>
      <section
        className={`validation ${
          hasWarnings
            ? "warning"
            : "ok"
        }`}
      >
        <div>
          <span>
            REVISÃO DE
            IMPORTAÇÃO
          </span>

          <h2>
            {d.filtro ===
            "PEDIDO"
              ? "Pedido + Usinagem"
              : `Filtro ${d.filtro}`}
          </h2>
        </div>

        {[
          [
            "Linhas",
            d.linhas,
          ],
          [
            "Pedidos",
            d.pedidos,
          ],
          [
            "OFs",
            d.ofs,
          ],
          [
            "Peças",
            Math.round(
              d.pecas
            ).toLocaleString(
              "pt-BR"
            ),
          ],
          [
            "Operações",
            d.operacoes,
          ],
          [
            "Sem rota",
            d.semRota,
          ],
          [
            "Inconsistências",
            d.inconsistenciasRota,
          ],
        ].map(
          ([
            label,
            value,
          ]) => (
            <div
              key={
                label as string
              }
            >
              <small>
                {label}
              </small>

              <b>
                {value}
              </b>
            </div>
          )
        )}
      </section>

      {hasWarnings && (
        <div className="warningBox">
          <b>
            ATENÇÃO —
            REVISÃO
            RECOMENDADA
          </b>

          {d.semRota >
            0 && (
            <span>
              {
                d.semRota
              }{" "}
              item(ns)
              sem rota
              identificada.
            </span>
          )}

          {d.inconsistenciasRota >
            0 && (
            <span>
              {
                d.inconsistenciasRota
              }{" "}
              inconsistência(s)
              de rota
              identificada(s).
            </span>
          )}

          <span>
            Esses avisos
            não bloqueiam
            a liberação
            da
            programação.
          </span>
        </div>
      )}

      <div className="reviewBar">
        <button
          onClick={
            back
          }
        >
          Voltar
        </button>

        <button
          className="primary"
          disabled={
            busy
          }
          onClick={
            release
          }
        >
          {busy
            ? "LIBERANDO..."
            : "LIBERAR PARA A FÁBRICA"}
        </button>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>SEQ.</th><th>PEDIDO</th><th>ITEM</th><th>OF</th><th>PRODUTO</th><th>FAMÍLIA</th><th>DESCRIÇÃO</th>
              <th>TIPO</th><th>CANAL</th><th>REBAIXO</th><th>ACABAMENTO</th><th>COR</th><th className="num">QTD PROGRAMADA</th>
              <th className="num">COMP.</th><th className="num">LARG.</th><th className="num">ESP.</th><th>PRIORIDADE</th><th>ROTA</th>
            </tr>
          </thead>

          <tbody>
            {d.produtos.slice(0, 250).map((p, index) => {
              const m = modeloProduto(p);
              return (
                <tr key={p.id}>
                  <td className="mono">{String(index + 1).padStart(2, "0")}</td>
                  <td>{m.pedido}</td><td>{m.item}</td><td><b>{m.of}</b></td><td>{m.produto}</td><td><em className="tag">{m.familia}</em></td>
                  <td className="descCell"><b>{m.descricao}</b></td><td>{m.tipo}</td><td>{m.canal}</td><td>{m.rebaixo}</td><td>{m.acabamento}</td><td>{m.cor}</td>
                  <td className="num">{m.planejado}</td><td className="num mono">{m.comprimento || "-"}</td><td className="num mono">{m.largura || "-"}</td><td className="num mono">{m.espessura || "-"}</td>
                  <td><span className={`priority p-${String(m.prioridade).toLowerCase()}`}>{m.prioridade}</span></td>
                  <td>
                    <div className="route">
                      {p.operacoes.map((o, i) => (
                        <span key={o.id}>{LABELS[o.processo] || o.processo}{i < p.operacoes.length - 1 && <i>›</i>}</span>
                      ))}
                      {!p.operacoes.length && <em>SEM ROTA</em>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tableNote">
        Prévia limitada
        a 250 linhas
        para manter a
        interface rápida.
        A programação
        completa será
        salva.
      </div>
    </>
  );
}
