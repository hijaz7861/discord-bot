require('dotenv').config();
const { 
  Client, GatewayIntentBits, Events, REST, Routes, 
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const playdl = require('play-dl');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1552149298911641620';
const PREFIX = '!'; 
const dataFile = './data.json';

// Load Database
let db = { users: {} };
if (fs.existsSync(dataFile)) db = JSON.parse(fs.readFileSync(dataFile));
const saveDB = () => fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ] 
});

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('help').setDescription('Show commands'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show server info'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show user info').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Show avatar').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages').addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('welcome').setDescription('Set welcome channel').addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('autorole').setDescription('Set auto-role').addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('balance').setDescription('Check your coins'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily coins'),
  new SlashCommandBuilder().setName('ticket').setDescription('Create a support ticket'),
  new SlashCommandBuilder().setName('play').setDescription('Play music').addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('Skip current song'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop music')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => { try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log('Commands registered.'); } catch (e) { console.error(e); } })();

client.once(Events.ClientReady, c => console.log(`Logged in as ${c.user.tag}`));

// Auto-Role & Welcome
client.on(Events.GuildMemberAdd, async member => {
  const channel = member.guild.channels.cache.find(ch => ch.name === 'welcome');
  if (channel) {
    const embed = new EmbedBuilder().setTitle('Welcome!').setDescription(`Hello ${member}, welcome to **${member.guild.name}**!`).setThumbnail(member.user.displayAvatarURL()).setColor('Green');
    channel.send({ embeds: [embed] });
  }
  // Auto Role (if configured in channel topic or just a default role name)
  const autoRole = member.guild.roles.cache.find(r => r.name === 'Member');
  if (autoRole) member.roles.add(autoRole).catch(() => {});
});

// Leveling System
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const userId = message.author.id;
  if (!db.users[userId]) db.users[userId] = { coins: 0, xp: 0, level: 1 };
  db.users[userId].xp += Math.floor(Math.random() * 10) + 5;
  if (db.users[userId].xp >= db.users[userId].level * 100) {
    db.users[userId].level++;
    db.users[userId].xp = 0;
    message.reply(`🎉 Congratulations ${message.author}, you leveled up to **Level ${db.users[userId].level}**!`);
  }
  saveDB();
});

// Music Player
const queues = new Map();
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const userId = interaction.user.id;
  if (!db.users[userId]) db.users[userId] = { coins: 0, xp: 0, level: 1 };

  if (commandName === 'ping') {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    await interaction.editReply(`Pong! ${sent.createdTimestamp - interaction.createdTimestamp}ms`);
  }
  if (commandName === 'help') {
    await interaction.reply('Commands: /ping, /help, /serverinfo, /userinfo, /avatar, /kick, /ban, /clear, /welcome, /autorole, /balance, /daily, /ticket, /play, /skip, /stop');
  }
  if (commandName === 'serverinfo') {
    const g = interaction.guild;
    const embed = new EmbedBuilder().setTitle(g.name).setThumbnail(g.iconURL()).addFields({ name: 'Members', value: `${g.memberCount}`, inline: true }, { name: 'Owner', value: `<@${g.ownerId}>`, inline: true });
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === 'userinfo') {
    const user = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder().setTitle(user.username).setThumbnail(user.displayAvatarURL()).addFields({ name: 'ID', value: user.id, inline: true });
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === 'avatar') {
    const user = interaction.options.getUser('user') || interaction.user;
    await interaction.reply(user.displayAvatarURL({ size: 1024 }));
  }
  if (commandName === 'kick') {
    const user = interaction.options.getMember('user');
    if (!user.kickable) return interaction.reply({ content: 'I cannot kick this user!', ephemeral: true });
    await user.kick(); await interaction.reply(`👢 Kicked **${user.user.tag}**`);
  }
  if (commandName === 'ban') {
    const user = interaction.options.getMember('user');
    if (!user.bannable) return interaction.reply({ content: 'I cannot ban this user!', ephemeral: true });
    await user.ban(); await interaction.reply(`🔨 Banned **${user.user.tag}**`);
  }
  if (commandName === 'clear') {
    const amount = interaction.options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
  }
  if (commandName === 'welcome') {
    const channel = interaction.options.getChannel('channel');
    await interaction.reply(`✅ Welcome channel set to ${channel}`);
  }
  if (commandName === 'autorole') {
    const role = interaction.options.getRole('role');
    await interaction.reply(`✅ Auto-role set to ${role.name}`);
  }
  if (commandName === 'balance') {
    await interaction.reply(`💰 You have **${db.users[userId].coins}** coins!`);
  }
  if (commandName === 'daily') {
    db.users[userId].coins += 100; saveDB();
    await interaction.reply(`💸 You claimed your daily 100 coins! Total: **${db.users[userId].coins}**`);
  }
  if (commandName === 'ticket') {
    const channel = await interaction.guild.channels.create({ name: `ticket-${interaction.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `Support ticket for ${interaction.user}`, components: [row] });
    await interaction.reply({ content: `🎫 Ticket created: ${channel}`, ephemeral: true });
  }
  if (commandName === 'play') {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
    const query = interaction.options.getString('query');
    await interaction.deferReply();
    try {
      const source = await playdl.stream(query);
      const resource = createAudioResource(source.stream, { inputType: source.type });
      const player = createAudioPlayer();
      const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: interaction.guild.id, adapterCreator: interaction.guild.voiceAdapterCreator });
      connection.subscribe(player);
      player.play(resource);
      queues.set(interaction.guild.id, player);
      await interaction.editReply(`🎶 Now playing: **${query}**`);
    } catch (e) { await interaction.editReply('❌ Could not play that song.'); }
  }
  if (commandName === 'skip') {
    const player = queues.get(interaction.guild.id);
    if (player) { player.stop(); await interaction.reply('⏭️ Skipped!'); } else await interaction.reply('No music playing.');
  }
  if (commandName === 'stop') {
    const player = queues.get(interaction.guild.id);
    if (player) { player.stop(); queues.delete(interaction.guild.id); await interaction.reply('⏹️ Stopped music.'); } else await interaction.reply('No music playing.');
  }
});

// Ticket Close Button
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'close_ticket') {
    await interaction.reply('🔒 Closing ticket in 3 seconds...');
    setTimeout(() => interaction.channel.delete(), 3000);
  }
});

client.login(TOKEN);
