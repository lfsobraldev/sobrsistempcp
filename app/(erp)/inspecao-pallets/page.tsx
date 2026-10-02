"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  LockKeyhole,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Truck,
  UnlockKeyhole,
  Wrench,
  XCircle,
} from "lucide-react";

import {
  Modal,
  Panel,
} from "@/components/ui";

import {
  useOps,
} from "@/components/operational-provider";

type Foto = {
  id: string;
  dataUrl: string;
  legenda: string;
  area: string;
  tipo: string;
  ncId?: string | null;
  usuario: string;
  criadoEm: string;
};

type Inspecao = {
  id: string;
  area: string;
  resultado: string;
  checklist: Record<
    string,
    boolean
  >;
  observacao: string;
  usuario: string;
  criadoEm: string;
};

type NaoConformidade = {
  id: string;
  codigo: string;
  categoria: string;
  tipoDefeito: string;
  gravidade: string;
  quantidadeAfetada: number;
  localDefeito: string;
  descricao: string;
  contencao: string;
  acaoCorretiva: string;
  responsavel: string;
  prazo: string | null;
  status: string;
  correcaoExecutada: string;
  corrigidoPor: string;
  corrigidoEm: string | null;
  reinspecaoResultado: string;
  reinspecaoUsuario: string;
  reinspecaoEm: string | null;
  reinspecaoObservacao: string;
  criadoPor: string;
  criadoEm: string;
};

type Medicao = {
  id: string;
  caracteristica: string;
  nominal:
    | number
    | null;
  toleranciaMin:
    | number
    | null;
  toleranciaMax:
    | number
    | null;
  medido: number;
  unidade: string;
  resultado: string;
  observacao: string;
  usuario: string;
  criadoEm: string;
};

type Evento = {
  id: number;
  tipo: string;
  descricao: string;
  usuario: string;
  criadoEm: string;
};

type Pallet = {
  id: string;
  codigo: string;
  pedido: string;
  cliente: string;
  filtro: string;
  pallet: string;

  tipo_produto: string;

  quantidade: number;
  jogos: number;

  turno: string;
  destino: string;
  montador: string;
  conferente: string;
  observacao: string;

  status: string;

  qualidade_status: string;
  msac_status: string;

  qualidade_usuario: string;
  qualidade_em:
    | string
    | null;

  qualidade_observacao: string;

  msac_usuario: string;

  msac_em:
    | string
    | null;

  msac_observacao: string;

  bloqueio_motivo: string;

  criado_em: string;
  atualizado_em: string;

  fotos_count: number;

  fotos?: Foto[];

  inspecoes?: Inspecao[];

  naoConformidades?: NaoConformidade[];

  medicoes?: Medicao[];

  eventos?: Evento[];
};

type Resumo = {
  total?: number;
  liberados?: number;
  bloqueados?: number;
  em_liberacao?: number;
  aguardando?: number;
  nc_abertas?: number;
};

const CHECKS = [
  [
    "alinhamento",
    "Alinhamento do pallet",
  ],

  [
    "amarracao",
    "Amarrações e cintas",
  ],

  [
    "calcos",
    "Calços e proteção",
  ],

  [
    "avarias",
    "Sem avarias aparentes",
  ],

  [
    "quantidade",
    "Quantidade conferida",
  ],

  [
    "identificacao",
    "Identificação / etiqueta",
  ],
] as const;

const CATEGORIAS = [
  "MONTAGEM",
  "PRODUTO",
  "QUANTIDADE",
  "IDENTIFICAÇÃO",
  "EMBALAGEM",
  "OUTROS",
];

const DEFEITOS = [
  "Desalinhamento",
  "Pallet fora de esquadro",
  "Amarração inadequada",
  "Falta de cinta",
  "Calço inadequado",
  "Proteção insuficiente",
  "Avaria",
  "Risco",
  "Quebra",
  "Peça lascada",
  "Acabamento danificado",
  "Cor divergente",
  "Medida divergente",
  "Falta de peças",
  "Excesso de peças",
  "Produto incorreto",
  "Etiqueta incorreta",
  "Pedido incorreto",
  "Destino incorreto",
  "Pallet sem identificação",
  "Outro",
];

function fmt(
  v: number
) {
  return Number(
    v || 0
  ).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits:
        3,
    }
  );
}

function date(
  v?:
    | string
    | null
) {
  return v
    ? new Date(
        v
      ).toLocaleString(
        "pt-BR"
      )
    : "-";
}

function statusLabel(
  v: string
) {
  return String(
    v || "-"
  ).replaceAll(
    "_",
    " "
  );
}

async function compressImage(
  file: File
) {
  const data =
    await new Promise<string>(
      (
        resolve,
        reject
      ) => {
        const r =
          new FileReader();

        r.onload = () =>
          resolve(
            String(
              r.result
            )
          );

        r.onerror = () =>
          reject(
            new Error(
              "Falha ao ler foto."
            )
          );

        r.readAsDataURL(
          file
        );
      }
    );

  const img =
    await new Promise<HTMLImageElement>(
      (
        resolve,
        reject
      ) => {
        const i =
          new Image();

        i.onload = () =>
          resolve(
            i
          );

        i.onerror = () =>
          reject(
            new Error(
              "Imagem inválida."
            )
          );

        i.src =
          data;
      }
    );

  const max =
    1280;

  const scale =
    Math.min(
      1,
      max /
        Math.max(
          img.width,
          img.height
        )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    Math.round(
      img.width *
        scale
    );

  canvas.height =
    Math.round(
      img.height *
        scale
    );

  canvas
    .getContext(
      "2d"
    )
    ?.drawImage(
      img,
      0,
      0,
      canvas.width,
      canvas.height
    );

  return canvas.toDataURL(
    "image/jpeg",
    0.76
  );
}

export default function InspecaoPallets() {
  const {
    toast,
    me,
  } = useOps();

  const [
    itens,
    setItens,
  ] =
    useState<Pallet[]>(
      []
    );

  const [
    resumo,
    setResumo,
  ] =
    useState<Resumo>(
      {}
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false
    );

  const [
    q,
    setQ,
  ] =
    useState(
      ""
    );

  const [
    status,
    setStatus,
  ] =
    useState(
      ""
    );

  const [
    selected,
    setSelected,
  ] =
    useState<
      Pallet | null
    >(
      null
    );

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(
      false
    );

  const [
    inspectionOpen,
    setInspectionOpen,
  ] =
    useState(
      false
    );

  const [
    decisionOpen,
    setDecisionOpen,
  ] =
    useState(
      false
    );

  const [
    ncOpen,
    setNcOpen,
  ] =
    useState(
      false
    );

  const [
    correctionOpen,
    setCorrectionOpen,
  ] =
    useState(
      false
    );

  const [
    reinspectionOpen,
    setReinspectionOpen,
  ] =
    useState(
      false
    );

  const [
    measurementOpen,
    setMeasurementOpen,
  ] =
    useState(
      false
    );

  const [
    decision,
    setDecision,
  ] =
    useState<{
      action: string;
      title: string;
    } | null>(
      null
    );

  const [
    motivo,
    setMotivo,
  ] =
    useState(
      ""
    );

  const [
    obs,
    setObs,
  ] =
    useState(
      ""
    );

  const [
    area,
    setArea,
  ] =
    useState<
      | "QUALIDADE"
      | "MSAC"
    >(
      "QUALIDADE"
    );

  const [
    checklist,
    setChecklist,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >(
      {}
    );

  const [
    inspectionObs,
    setInspectionObs,
  ] =
    useState(
      ""
    );

  const [
    activeNc,
    setActiveNc,
  ] =
    useState<
      NaoConformidade | null
    >(
      null
    );

  const [
    form,
    setForm,
  ] =
    useState({
      pedido:
        "",

      cliente:
        "",

      filtro:
        "",

      pallet:
        "",

      tipoProduto:
        "",

      quantidade:
        "",

      jogos:
        "",

      turno:
        "A",

      destino:
        "",

      montador:
        "",

      conferente:
        "",

      observacao:
        "",
    });

  const [
    ncForm,
    setNcForm,
  ] =
    useState({
      categoria:
        "MONTAGEM",

      tipoDefeito:
        "Desalinhamento",

      gravidade:
        "MAIOR",

      quantidadeAfetada:
        "1",

      localDefeito:
        "",

      descricao:
        "",

      contencao:
        "",

      acaoCorretiva:
        "",

      responsavel:
        "",

      prazo:
        "",
    });

  const [
    correcao,
    setCorrecao,
  ] =
    useState(
      ""
    );

  const [
    reinspecaoResultado,
    setReinspecaoResultado,
  ] =
    useState<
      | "APROVADO"
      | "REPROVADO"
    >(
      "APROVADO"
    );

  const [
    reinspecaoObs,
    setReinspecaoObs,
  ] =
    useState(
      ""
    );

  const [
    medicao,
    setMedicao,
  ] =
    useState({
      caracteristica:
        "",

      nominal:
        "",

      toleranciaMin:
        "",

      toleranciaMax:
        "",

      medido:
        "",

      unidade:
        "mm",

      observacao:
        "",
    });

  const photoRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    photoContext,
    setPhotoContext,
  ] =
    useState<{
      ncId?: string;

      tipo:
        | "GERAL"
        | "ANTES"
        | "DEPOIS";

      legenda: string;
    }>({
      tipo:
        "GERAL",

      legenda:
        "Foto do pallet",
    });

  async function openPallet(
    id: string
  ) {
    try {
      const r =
        await fetch(
          `/api/pallets?id=${
            encodeURIComponent(
              id
            )
          }`,
          {
            cache:
              "no-store",
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error
        );
      }

      setSelected(
        j.item
      );
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    }
  }

  async function load() {
    setBusy(
      true
    );

    try {
      const p =
        new URLSearchParams();

      if (
        q.trim()
      ) {
        p.set(
          "q",
          q.trim()
        );
      }

      if (status) {
        p.set(
          "status",
          status
        );
      }

      const r =
        await fetch(
          `/api/pallets?${p}`,
          {
            cache:
              "no-store",
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error
        );
      }

      setItens(
        j.itens ||
          []
      );

      setResumo(
        j.resumo ||
          {}
      );
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    } finally {
      setBusy(
        false
      );
    }
  }

  useEffect(
    () => {
      const t =
        setTimeout(
          load,
          150
        );

      return () =>
        clearTimeout(
          t
        );
    },
    [
      q,
      status,
    ]
  );

  const cards =
    useMemo(
      () => [
        [
          "Pallets (30 dias)",
          resumo.total ||
            0,
          "",
        ],

        [
          "Aguardando",
          resumo.aguardando ||
            0,
          "warn",
        ],

        [
          "Em liberação",
          resumo.em_liberacao ||
            0,
          "info",
        ],

        [
          "Bloqueados",
          resumo.bloqueados ||
            0,
          "danger",
        ],

        [
          "NC abertas",
          resumo.nc_abertas ||
            0,
          "danger",
        ],

        [
          "Liberados",
          resumo.liberados ||
            0,
          "success",
        ],
      ],
      [
        resumo,
      ]
    );

  async function create() {
    setBusy(
      true
    );

    try {
      const r =
        await fetch(
          "/api/pallets",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                form
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
        "Pallet cadastrado."
      );

      setCreateOpen(
        false
      );

      setForm({
        pedido:
          "",

        cliente:
          "",

        filtro:
          "",

        pallet:
          "",

        tipoProduto:
          "",

        quantidade:
          "",

        jogos:
          "",

        turno:
          "A",

        destino:
          "",

        montador:
          "",

        conferente:
          "",

        observacao:
          "",
      });

      await load();
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    } finally {
      setBusy(
        false
      );
    }
  }

  async function patch(
    body: any,
    successMessage =
      "Registro atualizado."
  ) {
    setBusy(
      true
    );

    try {
      const r =
        await fetch(
          "/api/pallets",
          {
            method:
              "PATCH",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                body
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
        successMessage
      );

      await load();

      if (selected) {
        await openPallet(
          selected.id
        );
      }

      return true;
    } catch (e: any) {
      toast(
        "error",
        e.message
      );

      return false;
    } finally {
      setBusy(
        false
      );
    }
  }

  async function saveInspection() {
    if (!selected) {
      return;
    }

    const ok =
      await patch(
        {
          id:
            selected.id,

          action:
            "INSPECIONAR",

          area,

          resultado:
            Object.values(
              checklist
            ).every(
              Boolean
            )
              ? "CONFORME"
              : "PENDENCIA",

          checklist,

          observacao:
            inspectionObs,
        },
        "Inspeção registrada."
      );

    if (ok) {
      setInspectionOpen(
        false
      );

      setChecklist(
        {}
      );

      setInspectionObs(
        ""
      );
    }
  }

  async function executeDecision() {
    if (
      !selected ||
      !decision
    ) {
      return;
    }

    const ok =
      await patch({
        id:
          selected.id,

        action:
          decision.action,

        motivo,

        observacao:
          obs,
      });

    if (ok) {
      setDecisionOpen(
        false
      );

      setDecision(
        null
      );

      setMotivo(
        ""
      );

      setObs(
        ""
      );
    }
  }

  function openDecision(
    action: string,
    title: string
  ) {
    setDecision({
      action,
      title,
    });

    setDecisionOpen(
      true
    );

    setMotivo(
      ""
    );

    setObs(
      ""
    );
  }

  async function createNc() {
    if (!selected) {
      return;
    }

    const ok =
      await patch(
        {
          id:
            selected.id,

          action:
            "CRIAR_NC",

          ...ncForm,
        },
        "Não conformidade registrada e pallet bloqueado."
      );

    if (ok) {
      setNcOpen(
        false
      );

      setNcForm({
        categoria:
          "MONTAGEM",

        tipoDefeito:
          "Desalinhamento",

        gravidade:
          "MAIOR",

        quantidadeAfetada:
          "1",

        localDefeito:
          "",

        descricao:
          "",

        contencao:
          "",

        acaoCorretiva:
          "",

        responsavel:
          "",

        prazo:
          "",
      });
    }
  }

  async function saveCorrection() {
    if (
      !selected ||
      !activeNc
    ) {
      return;
    }

    const ok =
      await patch(
        {
          id:
            selected.id,

          action:
            "REGISTRAR_CORRECAO",

          ncId:
            activeNc.id,

          correcaoExecutada:
            correcao,
        },
        "Correção registrada. Aguardando reinspeção."
      );

    if (ok) {
      setCorrectionOpen(
        false
      );

      setCorrecao(
        ""
      );

      setActiveNc(
        null
      );
    }
  }

  async function saveReinspection() {
    if (
      !selected ||
      !activeNc
    ) {
      return;
    }

    const ok =
      await patch(
        {
          id:
            selected.id,

          action:
            "REINSPECIONAR_NC",

          ncId:
            activeNc.id,

          resultado:
            reinspecaoResultado,

          observacao:
            reinspecaoObs,
        },
        "Reinspeção registrada."
      );

    if (ok) {
      setReinspectionOpen(
        false
      );

      setReinspecaoObs(
        ""
      );

      setReinspecaoResultado(
        "APROVADO"
      );

      setActiveNc(
        null
      );
    }
  }

  async function saveMeasurement() {
    if (!selected) {
      return;
    }

    const ok =
      await patch(
        {
          id:
            selected.id,

          action:
            "MEDICAO",

          ...medicao,
        },
        "Medição registrada."
      );

    if (ok) {
      setMeasurementOpen(
        false
      );

      setMedicao({
        caracteristica:
          "",

        nominal:
          "",

        toleranciaMin:
          "",

        toleranciaMax:
          "",

        medido:
          "",

        unidade:
          "mm",

        observacao:
          "",
      });
    }
  }

  function requestPhoto(
    context: {
      ncId?: string;

      tipo:
        | "GERAL"
        | "ANTES"
        | "DEPOIS";

      legenda: string;
    }
  ) {
    setPhotoContext(
      context
    );

    setArea(
      "QUALIDADE"
    );

    setTimeout(
      () =>
        photoRef.current?.click(),
      0
    );
  }

  async function addPhoto(
    file?: File
  ) {
    if (
      !selected ||
      !file
    ) {
      return;
    }

    setBusy(
      true
    );

    try {
      const dataUrl =
        await compressImage(
          file
        );

      const r =
        await fetch(
          "/api/pallets/fotos",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                palletId:
                  selected.id,

                dataUrl,

                area,

                legenda:
                  photoContext.legenda,

                tipo:
                  photoContext.tipo,

                ncId:
                  photoContext.ncId ||
                  null,
              }),
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
        "Foto adicionada."
      );

      await load();

      await openPallet(
        selected.id
      );
    } catch (e: any) {
      toast(
        "error",
        e.message
      );
    } finally {
      setBusy(
        false
      );

      if (
        photoRef.current
      ) {
        photoRef.current.value =
          "";
      }
    }
  }

  function printLabel(
    p: Pallet
  ) {
    setSelected(
      p
    );

    setTimeout(
      () => {
        document.body.classList.add(
          "print-pallet-label"
        );

        window.print();

        document.body.classList.remove(
          "print-pallet-label"
        );
      },
      80
    );
  }

  const abertas =
    selected
      ?.naoConformidades
      ?.filter(
        (
          n
        ) =>
          ![
            "APROVADA",
            "ENCERRADA",
          ].includes(
            n.status
          )
      ) ||
    [];

  return (
    <>
      <div className="pageTitle">
        <div>
          <span>
            QUALIDADE / MSAC
          </span>

          <h1>
            Inspeção e
            Liberação de
            Pallets
          </h1>

          <p>
            Inspeção, não
            conformidade,
            evidências,
            correção,
            reinspeção e
            liberação.
          </p>
        </div>

        <div className="palletTopActions">
          <button
            className="secondary"
            onClick={
              load
            }
          >
            <RefreshCw />

            Atualizar
          </button>

          <button
            className="primary"
            onClick={() =>
              setCreateOpen(
                true
              )
            }
          >
            <Plus />

            Novo pallet
          </button>
        </div>
      </div>

      <div className="palletKpis">
        {cards.map(
          ([
            a,
            b,
            t,
          ]) => (
            <div
              key={
                String(
                  a
                )
              }
              className={`palletKpi ${t}`}
            >
              <span>
                {a}
              </span>

              <b>
                {b}
              </b>
            </div>
          )
        )}
      </div>

      <Panel
        title="Controle de pallets"
        subtitle="Qualidade trata não conformidades antes da liberação para o MSAC."
      >
        <div className="palletFilters">
          <label>
            <Search />

            <input
              value={
                q
              }
              onChange={(
                e
              ) =>
                setQ(
                  e.target
                    .value
                )
              }
              placeholder="Buscar pedido, pallet, filtro ou cliente..."
            />
          </label>

          <select
            value={
              status
            }
            onChange={(
              e
            ) =>
              setStatus(
                e.target
                  .value
              )
            }
          >
            <option value="">
              Todos os
              status
            </option>

            <option>
              AGUARDANDO_INSPECAO
            </option>

            <option>
              EM_LIBERACAO
            </option>

            <option>
              BLOQUEADO
            </option>

            <option>
              LIBERADO
            </option>
          </select>
        </div>

        <div className="tableWrap palletTable">
          <table>
            <thead>
              <tr>
                <th>
                  Pallet
                </th>

                <th>
                  Pedido
                </th>

                <th>
                  Cliente
                </th>

                <th>
                  Filtro
                </th>

                <th>
                  Tipo
                </th>

                <th className="num">
                  Qtd
                </th>

                <th>
                  Qualidade
                </th>

                <th>
                  MSAC
                </th>

                <th>
                  Status
                </th>

                <th>
                  Fotos
                </th>

                <th>
                  Atualizado
                </th>

                <th>
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {itens.map(
                (
                  p
                ) => (
                  <tr
                    key={
                      p.id
                    }
                    className={
                      p.status ===
                      "BLOQUEADO"
                        ? "critRow"
                        : ""
                    }
                    onClick={() =>
                      openPallet(
                        p.id
                      )
                    }
                  >
                    <td>
                      <b>
                        {
                          p.pallet
                        }
                      </b>

                      <small className="palletCode">
                        {
                          p.codigo
                        }
                      </small>
                    </td>

                    <td>
                      {
                        p.pedido
                      }
                    </td>

                    <td>
                      {p.cliente ||
                        "-"}
                    </td>

                    <td>
                      {p.filtro ||
                        "-"}
                    </td>

                    <td>
                      {p.tipo_produto ||
                        "-"}
                    </td>

                    <td className="num">
                      {fmt(
                        p.quantidade
                      )}
                    </td>

                    <td>
                      <span
                        className={`palletStage s-${p.qualidade_status.toLowerCase()}`}
                      >
                        {statusLabel(
                          p.qualidade_status
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`palletStage s-${p.msac_status.toLowerCase()}`}
                      >
                        {statusLabel(
                          p.msac_status
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`palletGlobal g-${p.status.toLowerCase()}`}
                      >
                        {statusLabel(
                          p.status
                        )}
                      </span>
                    </td>

                    <td>
                      {p.fotos_count ||
                        0}
                    </td>

                    <td>
                      {date(
                        p.atualizado_em
                      )}
                    </td>

                    <td>
                      <div
                        className="rowActions"
                        onClick={(
                          e
                        ) =>
                          e.stopPropagation()
                        }
                      >
                        <button
                          title="Abrir"
                          onClick={() =>
                            openPallet(
                              p.id
                            )
                          }
                        >
                          <ClipboardCheck />
                        </button>

                        <button
                          title="Etiqueta"
                          onClick={() =>
                            printLabel(
                              p
                            )
                          }
                        >
                          <Printer />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {!itens.length &&
                !busy && (
                  <tr>
                    <td
                      colSpan={
                        12
                      }
                    >
                      <div className="empty">
                        <b>
                          Nenhum
                          pallet
                          encontrado.
                        </b>

                        <span>
                          Cadastre
                          o
                          primeiro
                          pallet
                          ou
                          altere
                          os
                          filtros.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </Panel>

      {selected && (
        <div className="palletDetail">
          <div className="palletDetailHead">
            <div>
              <span>
                {
                  selected.codigo
                }
              </span>

              <h2>
                Pallet{" "}
                {
                  selected.pallet
                }{" "}
                • Pedido{" "}
                {
                  selected.pedido
                }
              </h2>

              <p>
                {selected.cliente ||
                  "Cliente não informado"}

                {selected.destino
                  ? ` • ${selected.destino}`
                  : ""}
              </p>
            </div>

            <button
              onClick={() =>
                setSelected(
                  null
                )
              }
            >
              <XCircle />
            </button>
          </div>

          <div className="releaseFlow">
            <div
              className={
                selected.qualidade_status ===
                "LIBERADO"
                  ? "done"
                  : selected.qualidade_status ===
                    "BLOQUEADO"
                  ? "blocked"
                  : ""
              }
            >
              <ShieldCheck />

              <span>
                QUALIDADE
              </span>

              <b>
                {statusLabel(
                  selected.qualidade_status
                )}
              </b>

              <small>
                {selected.qualidade_usuario ||
                  "Aguardando"}
              </small>
            </div>

            <i>
              →
            </i>

            <div
              className={
                selected.msac_status ===
                "LIBERADO"
                  ? "done"
                  : selected.msac_status ===
                    "BLOQUEADO"
                  ? "blocked"
                  : ""
              }
            >
              <Truck />

              <span>
                MSAC
              </span>

              <b>
                {statusLabel(
                  selected.msac_status
                )}
              </b>

              <small>
                {selected.msac_usuario ||
                  "Aguardando"}
              </small>
            </div>

            <i>
              →
            </i>

            <div
              className={
                selected.status ===
                "LIBERADO"
                  ? "done"
                  : selected.status ===
                    "BLOQUEADO"
                  ? "blocked"
                  : ""
              }
            >
              <PackageCheck />

              <span>
                PALLET
              </span>

              <b>
                {statusLabel(
                  selected.status
                )}
              </b>

              <small>
                {selected.status ===
                "LIBERADO"
                  ? "Pronto para seguir"
                  : "Controle ativo"}
              </small>
            </div>
          </div>

          {selected.status ===
            "BLOQUEADO" && (
            <div className="palletBlockAlert">
              <LockKeyhole />

              <div>
                <b>
                  PALLET
                  BLOQUEADO
                </b>

                <span>
                  {selected.bloqueio_motivo ||
                    "Não conformidade em tratamento"}
                </span>
              </div>
            </div>
          )}

          <div className="palletMeta">
            <div>
              <small>
                Quantidade
              </small>

              <b>
                {fmt(
                  selected.quantidade
                )}
              </b>
            </div>

            <div>
              <small>
                Jogos
              </small>

              <b>
                {fmt(
                  selected.jogos
                )}
              </b>
            </div>

            <div>
              <small>
                Turno
              </small>

              <b>
                {selected.turno ||
                  "-"}
              </b>
            </div>

            <div>
              <small>
                Tipo
              </small>

              <b>
                {selected.tipo_produto ||
                  "-"}
              </b>
            </div>

            <div>
              <small>
                Montador
              </small>

              <b>
                {selected.montador ||
                  "-"}
              </b>
            </div>

            <div>
              <small>
                Conferente
              </small>

              <b>
                {selected.conferente ||
                  "-"}
              </b>
            </div>
          </div>

          <div className="palletActionGrid qualityActions">
            <button
              onClick={() => {
                setArea(
                  "QUALIDADE"
                );

                setInspectionOpen(
                  true
                );
              }}
            >
              <ClipboardCheck />

              Inspeção
            </button>

            <button
              className="dangerSoft"
              onClick={() =>
                setNcOpen(
                  true
                )
              }
            >
              <AlertTriangle />

              Registrar NC
            </button>

            <button
              onClick={() =>
                setMeasurementOpen(
                  true
                )
              }
            >
              <Ruler />

              Medição
            </button>

            <button
              onClick={() =>
                requestPhoto({
                  tipo:
                    "GERAL",

                  legenda:
                    "Evidência geral do pallet",
                })
              }
            >
              <ImagePlus />

              Foto geral
            </button>

            <button
              onClick={() =>
                printLabel(
                  selected
                )
              }
            >
              <Printer />

              Gerar etiqueta
            </button>
          </div>

          <input
            ref={
              photoRef
            }
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(
              e
            ) =>
              addPhoto(
                e.target
                  .files?.[0]
              )
            }
          />

          <section className="qualitySection">
            <div className="sectionTitle">
              <AlertTriangle />

              <b>
                Não
                conformidades
              </b>

              <span>
                {
                  abertas.length
                }{" "}
                aberta(s)
              </span>
            </div>

            {selected
              .naoConformidades
              ?.length ? (
              <div className="ncList">
                {selected.naoConformidades.map(
                  (
                    nc
                  ) => {
                    const fotosAntes =
                      selected.fotos?.filter(
                        (
                          f
                        ) =>
                          f.ncId ===
                            nc.id &&
                          f.tipo ===
                            "ANTES"
                      ) ||
                      [];

                    const fotosDepois =
                      selected.fotos?.filter(
                        (
                          f
                        ) =>
                          f.ncId ===
                            nc.id &&
                          f.tipo ===
                            "DEPOIS"
                      ) ||
                      [];

                    return (
                      <article
                        key={
                          nc.id
                        }
                        className={`ncCard nc-${nc.gravidade.toLowerCase()}`}
                      >
                        <div className="ncHead">
                          <div>
                            <span>
                              {
                                nc.codigo
                              }
                            </span>

                            <h3>
                              {
                                nc.tipoDefeito
                              }
                            </h3>
                          </div>

                          <div>
                            <b
                              className={`severity sev-${nc.gravidade.toLowerCase()}`}
                            >
                              {
                                nc.gravidade
                              }
                            </b>

                            <b className="ncStatus">
                              {statusLabel(
                                nc.status
                              )}
                            </b>
                          </div>
                        </div>

                        <div className="ncGrid">
                          <div>
                            <small>
                              Categoria
                            </small>

                            <b>
                              {
                                nc.categoria
                              }
                            </b>
                          </div>

                          <div>
                            <small>
                              Qtd
                              afetada
                            </small>

                            <b>
                              {fmt(
                                nc.quantidadeAfetada
                              )}
                            </b>
                          </div>

                          <div>
                            <small>
                              Local
                            </small>

                            <b>
                              {nc.localDefeito ||
                                "-"}
                            </b>
                          </div>

                          <div>
                            <small>
                              Responsável
                            </small>

                            <b>
                              {nc.responsavel ||
                                "-"}
                            </b>
                          </div>

                          <div>
                            <small>
                              Prazo
                            </small>

                            <b>
                              {date(
                                nc.prazo
                              )}
                            </b>
                          </div>

                          <div>
                            <small>
                              Criado
                              por
                            </small>

                            <b>
                              {
                                nc.criadoPor
                              }
                            </b>
                          </div>
                        </div>

                        <div className="ncText">
                          <small>
                            Descrição
                          </small>

                          <p>
                            {
                              nc.descricao
                            }
                          </p>
                        </div>

                        {nc.contencao && (
                          <div className="ncText">
                            <small>
                              Contenção
                              /
                              ação
                              imediata
                            </small>

                            <p>
                              {
                                nc.contencao
                              }
                            </p>
                          </div>
                        )}

                        {nc.acaoCorretiva && (
                          <div className="ncText">
                            <small>
                              Ação
                              corretiva
                              planejada
                            </small>

                            <p>
                              {
                                nc.acaoCorretiva
                              }
                            </p>
                          </div>
                        )}

                        {nc.correcaoExecutada && (
                          <div className="ncText successText">
                            <small>
                              Correção
                              executada
                            </small>

                            <p>
                              {
                                nc.correcaoExecutada
                              }
                            </p>
                          </div>
                        )}

                        <div className="evidenceCompare">
                          <div>
                            <b>
                              ANTES
                            </b>

                            {fotosAntes.length ? (
                              <div className="miniPhotos">
                                {fotosAntes.map(
                                  (
                                    f
                                  ) => (
                                    <img
                                      key={
                                        f.id
                                      }
                                      src={
                                        f.dataUrl
                                      }
                                      alt="Evidência antes"
                                    />
                                  )
                                )}
                              </div>
                            ) : (
                              <span>
                                Sem
                                foto
                              </span>
                            )}
                          </div>

                          <div>
                            <b>
                              DEPOIS
                            </b>

                            {fotosDepois.length ? (
                              <div className="miniPhotos">
                                {fotosDepois.map(
                                  (
                                    f
                                  ) => (
                                    <img
                                      key={
                                        f.id
                                      }
                                      src={
                                        f.dataUrl
                                      }
                                      alt="Evidência depois"
                                    />
                                  )
                                )}
                              </div>
                            ) : (
                              <span>
                                Sem
                                foto
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="ncActions">
                          <button
                            onClick={() =>
                              requestPhoto({
                                ncId:
                                  nc.id,

                                tipo:
                                  "ANTES",

                                legenda:
                                  `${nc.codigo} • evidência antes`,
                              })
                            }
                          >
                            <Camera />

                            Foto
                            antes
                          </button>

                          <button
                            onClick={() =>
                              requestPhoto({
                                ncId:
                                  nc.id,

                                tipo:
                                  "DEPOIS",

                                legenda:
                                  `${nc.codigo} • evidência depois`,
                              })
                            }
                          >
                            <Camera />

                            Foto
                            depois
                          </button>

                          {![
                            "APROVADA",
                            "ENCERRADA",
                          ].includes(
                            nc.status
                          ) && (
                            <button
                              onClick={() => {
                                setActiveNc(
                                  nc
                                );

                                setCorrecao(
                                  nc.correcaoExecutada ||
                                    ""
                                );

                                setCorrectionOpen(
                                  true
                                );
                              }}
                            >
                              <Wrench />

                              Registrar
                              correção
                            </button>
                          )}

                          {nc.status ===
                            "AGUARDANDO_REINSPECAO" && (
                            <button
                              className="primary"
                              onClick={() => {
                                setActiveNc(
                                  nc
                                );

                                setReinspectionOpen(
                                  true
                                );
                              }}
                            >
                              <ShieldCheck />

                              Reinspecionar
                            </button>
                          )}
                        </div>

                        {nc.reinspecaoResultado && (
                          <div
                            className={`reinspectionResult ${
                              nc.reinspecaoResultado ===
                              "APROVADO"
                                ? "approved"
                                : "rejected"
                            }`}
                          >
                            <b>
                              REINSPEÇÃO:{" "}
                              {
                                nc.reinspecaoResultado
                              }
                            </b>

                            <span>
                              {
                                nc.reinspecaoUsuario
                              }{" "}
                              •{" "}
                              {date(
                                nc.reinspecaoEm
                              )}
                            </span>

                            {nc.reinspecaoObservacao && (
                              <p>
                                {
                                  nc.reinspecaoObservacao
                                }
                              </p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="empty">
                <b>
                  Nenhuma
                  não
                  conformidade
                  registrada.
                </b>

                <span>
                  Use
                  “Registrar
                  NC”
                  quando
                  houver
                  desvio.
                </span>
              </div>
            )}
          </section>

          <section className="qualitySection">
            <div className="sectionTitle">
              <Ruler />

              <b>
                Medições
              </b>

              <span>
                {selected
                  .medicoes
                  ?.length ||
                  0}
              </span>
            </div>

            {selected
              .medicoes
              ?.length ? (
              <div className="tableWrap compactTable">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Característica
                      </th>

                      <th className="num">
                        Nominal
                      </th>

                      <th className="num">
                        Mín.
                      </th>

                      <th className="num">
                        Máx.
                      </th>

                      <th className="num">
                        Medido
                      </th>

                      <th>
                        Resultado
                      </th>

                      <th>
                        Responsável
                      </th>

                      <th>
                        Data
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {selected.medicoes.map(
                      (
                        m
                      ) => (
                        <tr
                          key={
                            m.id
                          }
                        >
                          <td>
                            <b>
                              {
                                m.caracteristica
                              }
                            </b>
                          </td>

                          <td className="num">
                            {m.nominal ??
                              "-"}
                          </td>

                          <td className="num">
                            {m.toleranciaMin ??
                              "-"}
                          </td>

                          <td className="num">
                            {m.toleranciaMax ??
                              "-"}
                          </td>

                          <td className="num">
                            <b>
                              {
                                m.medido
                              }{" "}
                              {
                                m.unidade
                              }
                            </b>
                          </td>

                          <td>
                            <span
                              className={`measureResult ${
                                m.resultado ===
                                "CONFORME"
                                  ? "ok"
                                  : m.resultado ===
                                    "NAO_CONFORME"
                                  ? "bad"
                                  : ""
                              }`}
                            >
                              {
                                m.resultado
                              }
                            </span>
                          </td>

                          <td>
                            {
                              m.usuario
                            }
                          </td>

                          <td>
                            {date(
                              m.criadoEm
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span>
                  Sem
                  medições
                  registradas.
                </span>
              </div>
            )}
          </section>

          <div className="palletDecisionGrid">
            <button
              className="release"
              disabled={
                abertas.length >
                0
              }
              onClick={() =>
                openDecision(
                  "QUALIDADE_LIBERAR",
                  "Liberar pela Qualidade"
                )
              }
            >
              <CheckCircle2 />

              Liberar
              Qualidade
            </button>

            <button
              className="block"
              onClick={() =>
                openDecision(
                  "QUALIDADE_BLOQUEAR",
                  "Bloquear pela Qualidade"
                )
              }
            >
              <LockKeyhole />

              Bloquear
              Qualidade
            </button>

            <button
              className="release"
              disabled={
                selected.qualidade_status !==
                "LIBERADO"
              }
              onClick={() =>
                openDecision(
                  "MSAC_LIBERAR",
                  "Liberar pelo MSAC"
                )
              }
            >
              <CheckCircle2 />

              Liberar
              MSAC
            </button>

            <button
              className="block"
              onClick={() =>
                openDecision(
                  "MSAC_BLOQUEAR",
                  "Bloquear pelo MSAC"
                )
              }
            >
              <LockKeyhole />

              Bloquear
              MSAC
            </button>

            {[
              "PCP",
              "GERENTE",
              "ENCARREGADO",
            ].includes(
              String(
                me?.perfil
              )
            ) && (
              <button
                className="reopen"
                onClick={() =>
                  openDecision(
                    "REABRIR",
                    "Reabrir pallet"
                  )
                }
              >
                <UnlockKeyhole />

                Reabrir
              </button>
            )}
          </div>

          <div className="photoSection">
            <div className="sectionTitle">
              <Camera />

              <b>
                Evidências
                fotográficas
              </b>

              <span>
                {selected
                  .fotos
                  ?.length ||
                  0}{" "}
                foto(s)
              </span>
            </div>

            {selected
              .fotos
              ?.length ? (
              <div className="photoGrid">
                {selected.fotos.map(
                  (
                    f
                  ) => (
                    <figure
                      key={
                        f.id
                      }
                    >
                      <img
                        src={
                          f.dataUrl
                        }
                        alt={
                          f.legenda ||
                          "Foto do pallet"
                        }
                      />

                      <figcaption>
                        <b>
                          {
                            f.tipo
                          }{" "}
                          •{" "}
                          {
                            f.area
                          }
                        </b>

                        <span>
                          {
                            f.legenda
                          }
                        </span>

                        <small>
                          {
                            f.usuario
                          }{" "}
                          •{" "}
                          {date(
                            f.criadoEm
                          )}
                        </small>
                      </figcaption>
                    </figure>
                  )
                )}
              </div>
            ) : (
              <div className="empty">
                <b>
                  Nenhuma
                  foto
                  adicionada.
                </b>

                <span>
                  Registre
                  a
                  condição
                  do
                  pallet
                  e
                  as
                  evidências
                  das
                  correções.
                </span>
              </div>
            )}
          </div>

          <div className="palletHistory">
            <div>
              <div className="sectionTitle">
                <ClipboardCheck />

                <b>
                  Inspeções
                </b>

                <span>
                  {selected
                    .inspecoes
                    ?.length ||
                    0}
                </span>
              </div>

              {selected
                .inspecoes
                ?.length ? (
                <div className="historyList">
                  {selected.inspecoes
                    .slice(
                      0,
                      12
                    )
                    .map(
                      (
                        i
                      ) => (
                        <article
                          key={
                            i.id
                          }
                        >
                          <b>
                            {
                              i.area
                            }{" "}
                            •{" "}
                            {
                              i.resultado
                            }
                          </b>

                          <span>
                            {
                              i.usuario
                            }{" "}
                            •{" "}
                            {date(
                              i.criadoEm
                            )}
                          </span>

                          {i.observacao && (
                            <p>
                              {
                                i.observacao
                              }
                            </p>
                          )}
                        </article>
                      )
                    )}
                </div>
              ) : (
                <div className="empty">
                  <span>
                    Sem
                    inspeções
                    registradas.
                  </span>
                </div>
              )}
            </div>

            <div>
              <div className="sectionTitle">
                <RefreshCw />

                <b>
                  Rastreabilidade
                </b>

                <span>
                  {selected
                    .eventos
                    ?.length ||
                    0}
                </span>
              </div>

              {selected
                .eventos
                ?.length ? (
                <div className="historyList">
                  {selected.eventos
                    .slice(
                      0,
                      20
                    )
                    .map(
                      (
                        e
                      ) => (
                        <article
                          key={
                            e.id
                          }
                        >
                          <b>
                            {
                              e.descricao
                            }
                          </b>

                          <span>
                            {
                              e.usuario
                            }{" "}
                            •{" "}
                            {date(
                              e.criadoEm
                            )}
                          </span>
                        </article>
                      )
                    )}
                </div>
              ) : (
                <div className="empty">
                  <span>
                    Sem
                    eventos
                    registrados.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={
          createOpen
        }
        title="Cadastrar pallet"
        onClose={() =>
          setCreateOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setCreateOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="primary"
              disabled={
                busy
              }
              onClick={
                create
              }
            >
              Cadastrar
              pallet
            </button>
          </>
        }
      >
        <div className="palletForm">
          {[
            [
              "Pedido",
              "pedido",
            ],

            [
              "Cliente",
              "cliente",
            ],

            [
              "Filtro",
              "filtro",
            ],

            [
              "Pallet",
              "pallet",
            ],

            [
              "Tipo de produto",
              "tipoProduto",
            ],

            [
              "Quantidade",
              "quantidade",
            ],

            [
              "Jogos",
              "jogos",
            ],

            [
              "Turno",
              "turno",
            ],

            [
              "Destino",
              "destino",
            ],

            [
              "Montador",
              "montador",
            ],

            [
              "Conferente",
              "conferente",
            ],
          ].map(
            ([
              label,
              key,
            ]) => (
              <label
                key={
                  key
                }
              >
                {
                  label
                }

                <input
                  value={
                    (
                      form as any
                    )[
                      key
                    ]
                  }
                  onChange={(
                    e
                  ) =>
                    setForm({
                      ...form,

                      [key]:
                        e
                          .target
                          .value,
                    })
                  }
                />
              </label>
            )
          )}

          <label className="wide">
            Observação

            <textarea
              value={
                form.observacao
              }
              onChange={(
                e
              ) =>
                setForm({
                  ...form,

                  observacao:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={
          inspectionOpen
        }
        title={`Inspeção • ${area}`}
        onClose={() =>
          setInspectionOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setInspectionOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="primary"
              disabled={
                busy
              }
              onClick={
                saveInspection
              }
            >
              Salvar
              inspeção
            </button>
          </>
        }
      >
        <div className="inspectionChecks">
          {CHECKS.map(
            ([
              key,
              label,
            ]) => (
              <label
                key={
                  key
                }
                className={
                  checklist[
                    key
                  ]
                    ? "ok"
                    : ""
                }
              >
                <input
                  type="checkbox"
                  checked={
                    !!checklist[
                      key
                    ]
                  }
                  onChange={(
                    e
                  ) =>
                    setChecklist({
                      ...checklist,

                      [key]:
                        e
                          .target
                          .checked,
                    })
                  }
                />

                <span>
                  <CheckCircle2 />

                  {
                    label
                  }
                </span>
              </label>
            )
          )}
        </div>

        <label className="modalText">
          Observação

          <textarea
            value={
              inspectionObs
            }
            onChange={(
              e
            ) =>
              setInspectionObs(
                e
                  .target
                  .value
              )
            }
            placeholder="Descreva a condição encontrada."
          />
        </label>
      </Modal>

      <Modal
        open={
          ncOpen
        }
        title="Registrar não conformidade"
        onClose={() =>
          setNcOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setNcOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="danger"
              disabled={
                busy
              }
              onClick={
                createNc
              }
            >
              Registrar e
              bloquear
            </button>
          </>
        }
      >
        <div className="qualityFormGrid">
          <label>
            Categoria

            <select
              value={
                ncForm.categoria
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  categoria:
                    e
                      .target
                      .value,
                })
              }
            >
              {CATEGORIAS.map(
                (
                  x
                ) => (
                  <option
                    key={
                      x
                    }
                  >
                    {
                      x
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            Tipo do defeito

            <select
              value={
                ncForm.tipoDefeito
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  tipoDefeito:
                    e
                      .target
                      .value,
                })
              }
            >
              {DEFEITOS.map(
                (
                  x
                ) => (
                  <option
                    key={
                      x
                    }
                  >
                    {
                      x
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            Gravidade

            <select
              value={
                ncForm.gravidade
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  gravidade:
                    e
                      .target
                      .value,
                })
              }
            >
              <option>
                CRITICA
              </option>

              <option>
                MAIOR
              </option>

              <option>
                MENOR
              </option>
            </select>
          </label>

          <label>
            Quantidade
            afetada

            <input
              type="number"
              min="0"
              step="0.001"
              value={
                ncForm.quantidadeAfetada
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  quantidadeAfetada:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label className="wide">
            Local do
            problema

            <input
              value={
                ncForm.localDefeito
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  localDefeito:
                    e
                      .target
                      .value,
                })
              }
              placeholder="Ex.: lateral direita, topo, pacote 3"
            />
          </label>

          <label className="wide">
            Descrição da
            não
            conformidade

            <textarea
              value={
                ncForm.descricao
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  descricao:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label className="wide">
            Ação imediata
            / contenção

            <textarea
              value={
                ncForm.contencao
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  contencao:
                    e
                      .target
                      .value,
                })
              }
              placeholder="Ex.: bloquear pallet e separar as peças afetadas"
            />
          </label>

          <label className="wide">
            Ação corretiva
            planejada

            <textarea
              value={
                ncForm.acaoCorretiva
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  acaoCorretiva:
                    e
                      .target
                      .value,
                })
              }
              placeholder="Ex.: refazer amarração, substituir peças, reembalar"
            />
          </label>

          <label>
            Responsável

            <input
              value={
                ncForm.responsavel
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  responsavel:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label>
            Prazo

            <input
              type="datetime-local"
              value={
                ncForm.prazo
              }
              onChange={(
                e
              ) =>
                setNcForm({
                  ...ncForm,

                  prazo:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={
          correctionOpen
        }
        title={`Registrar correção • ${
          activeNc?.codigo ||
          "NC"
        }`}
        onClose={() =>
          setCorrectionOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setCorrectionOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="primary"
              disabled={
                busy
              }
              onClick={
                saveCorrection
              }
            >
              Enviar para
              reinspeção
            </button>
          </>
        }
      >
        <label className="modalText">
          Correção
          executada

          <textarea
            value={
              correcao
            }
            onChange={(
              e
            ) =>
              setCorrecao(
                e
                  .target
                  .value
              )
            }
            placeholder="Descreva exatamente o que foi corrigido."
          />
        </label>
      </Modal>

      <Modal
        open={
          reinspectionOpen
        }
        title={`Reinspeção • ${
          activeNc?.codigo ||
          "NC"
        }`}
        onClose={() =>
          setReinspectionOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setReinspectionOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="primary"
              disabled={
                busy
              }
              onClick={
                saveReinspection
              }
            >
              Salvar
              reinspeção
            </button>
          </>
        }
      >
        <div className="reinspectionChoice">
          <button
            className={
              reinspecaoResultado ===
              "APROVADO"
                ? "active approved"
                : ""
            }
            onClick={() =>
              setReinspecaoResultado(
                "APROVADO"
              )
            }
          >
            <CheckCircle2 />

            Aprovado
          </button>

          <button
            className={
              reinspecaoResultado ===
              "REPROVADO"
                ? "active rejected"
                : ""
            }
            onClick={() =>
              setReinspecaoResultado(
                "REPROVADO"
              )
            }
          >
            <XCircle />

            Reprovado
          </button>
        </div>

        <label className="modalText">
          Observação da
          reinspeção

          <textarea
            value={
              reinspecaoObs
            }
            onChange={(
              e
            ) =>
              setReinspecaoObs(
                e
                  .target
                  .value
              )
            }
          />
        </label>
      </Modal>

      <Modal
        open={
          measurementOpen
        }
        title="Registrar medição"
        onClose={() =>
          setMeasurementOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setMeasurementOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className="primary"
              disabled={
                busy
              }
              onClick={
                saveMeasurement
              }
            >
              Salvar
              medição
            </button>
          </>
        }
      >
        <div className="qualityFormGrid">
          <label className="wide">
            Característica

            <input
              value={
                medicao.caracteristica
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  caracteristica:
                    e
                      .target
                      .value,
                })
              }
              placeholder="Ex.: largura do pallet"
            />
          </label>

          <label>
            Nominal

            <input
              type="number"
              step="0.001"
              value={
                medicao.nominal
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  nominal:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label>
            Unidade

            <input
              value={
                medicao.unidade
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  unidade:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label>
            Tolerância
            mín.

            <input
              type="number"
              step="0.001"
              value={
                medicao.toleranciaMin
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  toleranciaMin:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label>
            Tolerância
            máx.

            <input
              type="number"
              step="0.001"
              value={
                medicao.toleranciaMax
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  toleranciaMax:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label>
            Valor medido

            <input
              type="number"
              step="0.001"
              value={
                medicao.medido
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  medido:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>

          <label className="wide">
            Observação

            <textarea
              value={
                medicao.observacao
              }
              onChange={(
                e
              ) =>
                setMedicao({
                  ...medicao,

                  observacao:
                    e
                      .target
                      .value,
                })
              }
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={
          decisionOpen
        }
        title={
          decision?.title ||
          "Decisão"
        }
        onClose={() =>
          setDecisionOpen(
            false
          )
        }
        footer={
          <>
            <button
              className="secondary"
              onClick={() =>
                setDecisionOpen(
                  false
                )
              }
            >
              Cancelar
            </button>

            <button
              className={
                decision?.action.endsWith(
                  "BLOQUEAR"
                )
                  ? "danger"
                  : "primary"
              }
              disabled={
                busy
              }
              onClick={
                executeDecision
              }
            >
              Confirmar
            </button>
          </>
        }
      >
        <div className="decisionForm">
          {decision?.action.endsWith(
            "BLOQUEAR"
          ) && (
            <label>
              Motivo do
              bloqueio

              <textarea
                value={
                  motivo
                }
                onChange={(
                  e
                ) =>
                  setMotivo(
                    e
                      .target
                      .value
                  )
                }
              />
            </label>
          )}

          <label>
            Observação

            <textarea
              value={
                obs
              }
              onChange={(
                e
              ) =>
                setObs(
                  e
                    .target
                    .value
                )
              }
            />
          </label>
        </div>
      </Modal>

      {selected && (
        <section
          id="pallet-label-print"
          className="palletLabelPrint"
        >
          <header>
            <b>
              FAMOSSUL •
              CONTROLE DE
              PALLET
            </b>

            <span>
              {
                selected.codigo
              }
            </span>
          </header>

          <main>
            <div className="labelBig">
              <small>
                PALLET
              </small>

              <b>
                {
                  selected.pallet
                }
              </b>
            </div>

            <div className="labelBig">
              <small>
                PEDIDO
              </small>

              <b>
                {
                  selected.pedido
                }
              </b>
            </div>

            <dl>
              <div>
                <dt>
                  Cliente
                </dt>

                <dd>
                  {selected.cliente ||
                    "-"}
                </dd>
              </div>

              <div>
                <dt>
                  Filtro
                </dt>

                <dd>
                  {selected.filtro ||
                    "-"}
                </dd>
              </div>

              <div>
                <dt>
                  Tipo
                </dt>

                <dd>
                  {selected.tipo_produto ||
                    "-"}
                </dd>
              </div>

              <div>
                <dt>
                  Quantidade
                </dt>

                <dd>
                  {fmt(
                    selected.quantidade
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Jogos
                </dt>

                <dd>
                  {fmt(
                    selected.jogos
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Destino
                </dt>

                <dd>
                  {selected.destino ||
                    "-"}
                </dd>
              </div>
            </dl>

            <div
              className={`labelStatus ${selected.status.toLowerCase()}`}
            >
              {statusLabel(
                selected.status
              )}
            </div>

            <div className="labelSign">
              <span>
                QUALIDADE:{" "}
                {statusLabel(
                  selected.qualidade_status
                )}{" "}
                •{" "}
                {selected.qualidade_usuario ||
                  "-"}
              </span>

              <span>
                MSAC:{" "}
                {statusLabel(
                  selected.msac_status
                )}{" "}
                •{" "}
                {selected.msac_usuario ||
                  "-"}
              </span>

              <span>
                NC ABERTAS:{" "}
                {
                  abertas.length
                }
              </span>
            </div>
          </main>

          <footer>
            Gerado em{" "}
            {new Date().toLocaleString(
              "pt-BR"
            )}
          </footer>
        </section>
      )}
    </>
  );
}
