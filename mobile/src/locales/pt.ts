export const pt = {
  // Auth screens
  auth: {
    title: 'Alugatek',
    subtitle: 'Alugue tech. Simplesmente.',
    email: 'Email',
    password: 'Palavra-passe',
    fullName: 'Nome Completo',
    signIn: 'Entrar',
    signInGoogle: 'Entrar com Google',
    createAccount: 'Criar Conta',
    noAccount: 'Não tem conta? Registe-se',
    hasAccount: 'Já tem uma conta? Entre',
    loginFailed: 'Falha no login',
    registrationFailed: 'Falha no registo',
    errorFillFields: 'Por favor, preencha todos os campos.',
    errorPasswordMinLength: 'A palavra-passe deve ter pelo menos 6 caracteres.',
    errorNetworkDetail: 'A aplicação não conseguiu alcançar a API. Certifique-se de que o backend está ligado e a URL da API aponta para o IP da LAN da sua máquina.',
    googleLoginFailed: 'Falha no login do Google',
    tryAgain: 'Por favor, tente novamente.',
  },

  // Home screen
  home: {
    searchPlaceholder: 'Procurar itens...',
    allDistricts: 'Todos os distritos',
    loading: 'A carregar...',
    noItems: 'Nenhum item encontrado.',
  },

  // Create/Edit Item screen
  item: {
    createTitle: 'Listar Novo Item',
    editTitle: 'Editar Item',
    title: 'Título',
    description: 'Descrição',
    district: 'Distrito',
    selectDistrict: 'Selecione um distrito',
    category: 'Categoria',
    dailyRate: 'Taxa Diária (€)',
    caucao: 'Caução (€)',
    selectCategory: 'Selecione uma categoria',
    selectPhoto: 'Selecionar Foto',
    uploadPhoto: 'Carregar Foto',
    photoPreview: 'Pré-visualização da Foto',
    listItem: 'Listar Item',
    updateItem: 'Atualizar Item',
    error: 'Erro',
    errorFillFields: 'Por favor, preencha todos os campos.',
    errorSelectPhoto: 'Por favor, selecione uma foto.',
    errorSelectCategory: 'Por favor, selecione uma categoria.',
    errorSelectDistrict: 'Por favor, selecione um distrito.',
    creationSuccess: 'Item listado com sucesso!',
    updateSuccess: 'Item atualizado com sucesso!',
    creationFailed: 'Falha ao criar item.',
    updateFailed: 'Falha ao atualizar item.',
  },

  // Item detail screen
  itemDetail: {
    description: 'Descrição',
    owner: 'Proprietário',
    reviews: 'Avaliações',
    rentalDuration: 'Duração do Aluguer',
    days: 'dia',
    daysPlural: 'dias',
    for: 'para',
    total: 'Total',
    rentNow: 'Alugar Agora',
    unavailable: 'Alugado',
    message: 'Mensagem',
    deleteItem: 'Apagar Item',
    deleteConfirm: 'Tem a certeza que quer apagar',
    deleteConfirmDetail: 'Esta ação não pode ser desfeita.',
    cancel: 'Cancelar',
    delete: 'Apagar',
    confirmRental: 'Confirmar Aluguer',
    rentalSuccess: 'Aluguer criado!',
    rentalFailed: 'Não foi possível criar o aluguer.',
    deleteSuccess: 'Item apagado!',
    deleteFailed: 'Não foi possível apagar o item.',
  },

  // My Advertisements screen
  myAdvertisements: {
    title: 'Meus Anúncios',
    noItems: 'Ainda não listou nenhum item.',
    edit: 'Editar',
    available: 'Disponível',
    unavailable: 'Alugado',
  },

  // My Rentals screen
  myRentals: {
    title: 'Meus Alugueres',
    noRentals: 'Ainda não alugou nada.',
    pending: 'Pendente',
    active: 'Ativo',
    completed: 'Em curso',
    returnRequested: 'A confirmar devolução',
    returned: 'Concluído',
    cancelled: 'Cancelado',
    from: 'De',
    to: 'Para',
  },

  // Chat screens
  chat: {
    conversations: 'Mensagens',
    noConversations: 'Ainda não tem conversas.',
    writeMessage: 'Escrever uma mensagem...',
    send: 'Enviar',
    noMessages: 'Nenhuma mensagem ainda.',
    today: 'Hoje',
    yesterday: 'Ontem',
  },

  // Profile screen
  profile: {
    title: 'Perfil',
    email: 'Email',
    name: 'Nome',
    logout: 'Sair',
    signOut: 'Sair',
    payouts: 'Receber pagamentos',
    payoutsConnected: 'Conta de pagamentos ativa',
    payoutsNotConnected: 'Conta de pagamentos n\u00e3o configurada',
    payoutsSetup: 'Configurar conta de pagamentos',
    payoutsResume: 'Continuar configura\u00e7\u00e3o',
    payoutsNote: 'Necess\u00e1rio para receber o valor dos seus alugueres.',
    payoutsError: 'N\u00e3o foi poss\u00edvel iniciar a configura\u00e7\u00e3o.',
  },

  // Navigation
  navigation: {
    home: 'Início',
    myItems: 'Anúncios',
    myRentals: 'Alugueres',
    messages: 'Mensagens',
    profile: 'Perfil',
    createItem: 'Novo Item',
  },

  // Common
  common: {
    error: 'Erro',
    success: 'Sucesso',
    ok: 'OK',
    cancel: 'Cancelar',
    loading: 'A carregar...',
    retry: 'Tentar Novamente',
  },

  // Payment
  payment: {
    title: 'Pagamento',
    confirm: 'Autorizar Pagamento',
    holdNote: 'O valor será retido no seu cartão e cobrado após a devolução do item.',
    incompleteCard: 'Por favor, preencha os dados do cartão.',
    failed: 'Não foi possível processar o pagamento.',
    successTitle: 'Pagamento autorizado!',
    successMessage: 'O valor ficará retido até à devolução do item.',
  },
};
