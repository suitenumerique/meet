<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:mailappor="http://schemas.microsoft.com/office/mailappversionoverrides/1.0" xsi:type="MailApp">
  <Id>{{ .id }}</Id>
  <Version>0.0.3.0</Version>
  <ProviderName>{{ .appName }}</ProviderName>
  <DefaultLocale>fr-FR</DefaultLocale>
  <DisplayName DefaultValue="{{ .appName }}"/>
  <Description DefaultValue="Ajoutez facilement un lien de réunion {{ .appName }} à vos emails et événements Outlook."/>
  <IconUrl DefaultValue="{{ .baseUrl }}/assets/icon-64.png"/>
  <HighResolutionIconUrl DefaultValue="{{ .baseUrl }}/assets/icon-128.png"/>
  <SupportUrl DefaultValue="https://lasuite.crisp.help/fr/category/visio-15sakkg/"/>
  <AppDomains>
    <AppDomain>{{ .baseUrl }}/</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Mailbox"/>
  </Hosts>
  <Requirements>
    <Sets>
      <Set Name="Mailbox" MinVersion="1.1"/>
    </Sets>
  </Requirements>
  <FormSettings>
    <Form xsi:type="ItemRead">
      <DesktopSettings>
        <SourceLocation DefaultValue="{{ .baseUrl }}/taskpane.html"/>
        <RequestedHeight>250</RequestedHeight>
      </DesktopSettings>
    </Form>
    <Form xsi:type="ItemEdit">
      <DesktopSettings>
        <SourceLocation DefaultValue="{{ .baseUrl }}/taskpane.html"/>
      </DesktopSettings>
    </Form>
  </FormSettings>
  <Permissions>ReadWriteItem</Permissions>
  <Rule xsi:type="RuleCollection" Mode="Or">
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Read"/>
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Edit"/>
    <Rule xsi:type="ItemIs" ItemType="Appointment" FormType="Edit"/>
  </Rule>
  <DisableEntityHighlighting>false</DisableEntityHighlighting>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Requirements>
      <bt:Sets DefaultMinVersion="1.3">
        <bt:Set Name="Mailbox"/>
      </bt:Sets>
    </Requirements>
    <Hosts>
      <Host xsi:type="MailHost">
        <DesktopFormFactor>
          <FunctionFile resid="Commands.Url"/>

          <!-- ─── Mail: Read ─────────────────────────────────────────── -->
          <ExtensionPoint xsi:type="MessageReadCommandSurface">
            <OfficeTab id="TabDefault">
              <Group id="msgReadGroup">
                <Label resid="GroupLabel"/>
                <Control xsi:type="Button" id="msgReadOpenPaneButton">
                  <Label resid="TaskpaneButton.Label"/>
                  <Supertip>
                    <Title resid="TaskpaneButton.Label"/>
                    <Description resid="TaskpaneButton.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>

          <!-- ─── Mail: Compose ─────────────────────────────────────── -->
          <ExtensionPoint xsi:type="MessageComposeCommandSurface">
            <OfficeTab id="TabDefault">
              <Group id="msgComposeGroup">
                <Label resid="GroupLabel"/>
                <Control xsi:type="Button" id="msgComposeGenerateLinkButton">
                  <Label resid="GenerateLink.Label"/>
                  <Supertip>
                    <Title resid="GenerateLink.Label"/>
                    <Description resid="GenerateLink.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ExecuteFunction">
                    <FunctionName>generateMeetingLinkFromMail</FunctionName>
                  </Action>
                </Control>
                <Control xsi:type="Button" id="msgComposeOpenPaneButton">
                  <Label resid="TaskpaneButton.Label"/>
                  <Supertip>
                    <Title resid="TaskpaneButton.Label"/>
                    <Description resid="TaskpaneButton.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Settings.16x16"/>
                    <bt:Image size="32" resid="Settings.32x32"/>
                    <bt:Image size="80" resid="Settings.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>

          <!-- ─── Calendar: Compose (New/Edit appointment) ──────────── -->
          <ExtensionPoint xsi:type="AppointmentOrganizerCommandSurface">
            <OfficeTab id="TabDefault">
              <Group id="apptComposeGroup">
                <Label resid="GroupLabel"/>
                <Control xsi:type="Button" id="apptGenerateLinkButton">
                  <Label resid="GenerateLink.Label"/>
                  <Supertip>
                    <Title resid="GenerateLink.Label"/>
                    <Description resid="GenerateLink.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ExecuteFunction">
                    <FunctionName>generateMeetingLinkFromCalendar</FunctionName>
                  </Action>
                </Control>

                <Control xsi:type="Button" id="apptOpenSettingsButton">
                  <Label resid="OpenSettings.Label"/>
                  <Supertip>
                    <Title resid="OpenSettings.Label"/>
                    <Description resid="OpenSettings.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Settings.16x16"/>
                    <bt:Image size="32" resid="Settings.32x32"/>
                    <bt:Image size="80" resid="Settings.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>

              </Group>
            </OfficeTab>
          </ExtensionPoint>

        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Settings.16x16" DefaultValue="{{ .baseUrl }}/assets/settings-16.png"/>
        <bt:Image id="Settings.32x32" DefaultValue="{{ .baseUrl }}/assets/settings-32.png"/>
        <bt:Image id="Settings.80x80" DefaultValue="{{ .baseUrl }}/assets/settings-80.png"/>
        <bt:Image id="Add.16x16" DefaultValue="{{ .baseUrl }}/assets/add-16.png"/>
        <bt:Image id="Add.32x32" DefaultValue="{{ .baseUrl }}/assets/add-32.png"/>
        <bt:Image id="Add.80x80" DefaultValue="{{ .baseUrl }}/assets/add-80.png"/>
        <bt:Image id="Icon.16x16" DefaultValue="{{ .baseUrl }}/assets/icon-16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="{{ .baseUrl }}/assets/icon-32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="{{ .baseUrl }}/assets/icon-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Commands.Url" DefaultValue="{{ .baseUrl }}/commands.html"/>
        <bt:Url id="Taskpane.Url" DefaultValue="{{ .baseUrl }}/taskpane.html"/>
      </bt:Urls>
      <bt:ShortStrings>
        <!-- Default (French) -->
        <bt:String id="GroupLabel" DefaultValue="{{ .appName }}"/>
        <bt:String id="GenerateLink.Label" DefaultValue="Ajouter un lien {{ .appName }}">
          <bt:Override Locale="en-US" Value="Add a {{ .appName }} link"/>
          <bt:Override Locale="de-DE" Value="{{ .appName }}-Link hinzufügen"/>
        </bt:String>
        <bt:String id="TaskpaneButton.Label" DefaultValue="Ouvrir les paramètres">
          <bt:Override Locale="en-US" Value="Open settings"/>
          <bt:Override Locale="de-DE" Value="Einstellungen öffnen"/>
        </bt:String>
        <bt:String id="OpenSettings.Label" DefaultValue="Paramètres">
          <bt:Override Locale="en-US" Value="Settings"/>
          <bt:Override Locale="de-DE" Value="Einstellungen"/>
        </bt:String>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GenerateLink.Tooltip" DefaultValue="Génère un lien de réunion {{ .appName }} et l'insère dans l'événement.">
          <bt:Override Locale="de-DE" Value="Generiert einen {{ .appName }}-Besprechungslink und fügt ihn in den Termin ein."/>
          <bt:Override Locale="en-US" Value="Generates a {{ .appName }} meeting link and inserts it into the item."/>
        </bt:String>
        <bt:String id="TaskpaneButton.Tooltip" DefaultValue="Ouvre les paramètres de connexion {{ .appName }}.">
          <bt:Override Locale="de-DE" Value="Öffnet die {{ .appName }}-Verbindungseinstellungen."/>
          <bt:Override Locale="en-US" Value="Opens the {{ .appName }} connection settings."/>
        </bt:String>
        <bt:String id="OpenSettings.Tooltip" DefaultValue="Ouvre les paramètres de connexion {{ .appName }}.">
          <bt:Override Locale="de-DE" Value="Öffnet die {{ .appName }}-Verbindungseinstellungen."/>
          <bt:Override Locale="en-US" Value="Opens the {{ .appName }} connection settings."/>
        </bt:String>
      </bt:LongStrings>
    </Resources>

    <!-- ─── V1.1 override: MUST be nested inside the V1.0 block, after Resources ─── -->
    <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides/1.1" xsi:type="VersionOverridesV1_1">
      <Requirements>
        <bt:Sets DefaultMinVersion="1.8">
          <bt:Set Name="Mailbox"/>
        </bt:Sets>
      </Requirements>
      <Hosts>
        <Host xsi:type="MailHost">
          <DesktopFormFactor>
            <SupportsSharedFolders>true</SupportsSharedFolders>
            <FunctionFile resid="Commands.Url"/>

            <!-- ─── Mail: Read ─────────────────────────────────────────── -->
            <ExtensionPoint xsi:type="MessageReadCommandSurface">
              <OfficeTab id="TabDefault">
                <Group id="msgReadGroup">
                  <Label resid="GroupLabel"/>
                  <Control xsi:type="Button" id="msgReadOpenPaneButton">
                    <Label resid="TaskpaneButton.Label"/>
                    <Supertip>
                      <Title resid="TaskpaneButton.Label"/>
                      <Description resid="TaskpaneButton.Tooltip"/>
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Icon.16x16"/>
                      <bt:Image size="32" resid="Icon.32x32"/>
                      <bt:Image size="80" resid="Icon.80x80"/>
                    </Icon>
                    <Action xsi:type="ShowTaskpane">
                      <SourceLocation resid="Taskpane.Url"/>
                    </Action>
                  </Control>
                </Group>
              </OfficeTab>
            </ExtensionPoint>

            <!-- ─── Mail: Compose ─────────────────────────────────────── -->
            <ExtensionPoint xsi:type="MessageComposeCommandSurface">
              <OfficeTab id="TabDefault">
                <Group id="msgComposeGroup">
                  <Label resid="GroupLabel"/>
                  <Control xsi:type="Button" id="msgComposeGenerateLinkButton">
                    <Label resid="GenerateLink.Label"/>
                    <Supertip>
                      <Title resid="GenerateLink.Label"/>
                      <Description resid="GenerateLink.Tooltip"/>
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Icon.16x16"/>
                      <bt:Image size="32" resid="Icon.32x32"/>
                      <bt:Image size="80" resid="Icon.80x80"/>
                    </Icon>
                    <Action xsi:type="ExecuteFunction">
                      <FunctionName>generateMeetingLinkFromMail</FunctionName>
                    </Action>
                  </Control>
                  <Control xsi:type="Button" id="msgComposeOpenPaneButton">
                    <Label resid="TaskpaneButton.Label"/>
                    <Supertip>
                      <Title resid="TaskpaneButton.Label"/>
                      <Description resid="TaskpaneButton.Tooltip"/>
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Settings.16x16"/>
                      <bt:Image size="32" resid="Settings.32x32"/>
                      <bt:Image size="80" resid="Settings.80x80"/>
                    </Icon>
                    <Action xsi:type="ShowTaskpane">
                      <SourceLocation resid="Taskpane.Url"/>
                    </Action>
                  </Control>
                </Group>
              </OfficeTab>
            </ExtensionPoint>

            <!-- ─── Calendar: Compose (New/Edit appointment) ──────────── -->
            <ExtensionPoint xsi:type="AppointmentOrganizerCommandSurface">
              <OfficeTab id="TabDefault">
                <Group id="apptComposeGroup">
                  <Label resid="GroupLabel"/>
                  <Control xsi:type="Button" id="apptGenerateLinkButton">
                    <Label resid="GenerateLink.Label"/>
                    <Supertip>
                      <Title resid="GenerateLink.Label"/>
                      <Description resid="GenerateLink.Tooltip"/>
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Icon.16x16"/>
                      <bt:Image size="32" resid="Icon.32x32"/>
                      <bt:Image size="80" resid="Icon.80x80"/>
                    </Icon>
                    <Action xsi:type="ExecuteFunction">
                      <FunctionName>generateMeetingLinkFromCalendar</FunctionName>
                    </Action>
                  </Control>

                  <Control xsi:type="Button" id="apptOpenSettingsButton">
                    <Label resid="OpenSettings.Label"/>
                    <Supertip>
                      <Title resid="OpenSettings.Label"/>
                      <Description resid="OpenSettings.Tooltip"/>
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Settings.16x16"/>
                      <bt:Image size="32" resid="Settings.32x32"/>
                      <bt:Image size="80" resid="Settings.80x80"/>
                    </Icon>
                    <Action xsi:type="ShowTaskpane">
                      <SourceLocation resid="Taskpane.Url"/>
                    </Action>
                  </Control>

                </Group>
              </OfficeTab>
            </ExtensionPoint>

          </DesktopFormFactor>
        </Host>
      </Hosts>
      <Resources>
        <bt:Images>
          <bt:Image id="Settings.16x16" DefaultValue="{{ .baseUrl }}/assets/settings-16.png"/>
          <bt:Image id="Settings.32x32" DefaultValue="{{ .baseUrl }}/assets/settings-32.png"/>
          <bt:Image id="Settings.80x80" DefaultValue="{{ .baseUrl }}/assets/settings-80.png"/>
          <bt:Image id="Add.16x16" DefaultValue="{{ .baseUrl }}/assets/add-16.png"/>
          <bt:Image id="Add.32x32" DefaultValue="{{ .baseUrl }}/assets/add-32.png"/>
          <bt:Image id="Add.80x80" DefaultValue="{{ .baseUrl }}/assets/add-80.png"/>
          <bt:Image id="Icon.16x16" DefaultValue="{{ .baseUrl }}/assets/icon-16.png"/>
          <bt:Image id="Icon.32x32" DefaultValue="{{ .baseUrl }}/assets/icon-32.png"/>
          <bt:Image id="Icon.80x80" DefaultValue="{{ .baseUrl }}/assets/icon-80.png"/>
        </bt:Images>
        <bt:Urls>
          <bt:Url id="Commands.Url" DefaultValue="{{ .baseUrl }}/commands.html"/>
          <bt:Url id="Taskpane.Url" DefaultValue="{{ .baseUrl }}/taskpane.html"/>
        </bt:Urls>
        <bt:ShortStrings>
          <!-- Default (French) -->
          <bt:String id="GroupLabel" DefaultValue="{{ .appName }}"/>
          <bt:String id="GenerateLink.Label" DefaultValue="Ajouter un lien {{ .appName }}">
            <bt:Override Locale="en-US" Value="Add a {{ .appName }} link"/>
            <bt:Override Locale="de-DE" Value="{{ .appName }}-Link hinzufügen"/>
          </bt:String>
          <bt:String id="TaskpaneButton.Label" DefaultValue="Ouvrir les paramètres">
            <bt:Override Locale="en-US" Value="Open settings"/>
            <bt:Override Locale="de-DE" Value="Einstellungen öffnen"/>
          </bt:String>
          <bt:String id="OpenSettings.Label" DefaultValue="Paramètres">
            <bt:Override Locale="en-US" Value="Settings"/>
            <bt:Override Locale="de-DE" Value="Einstellungen"/>
          </bt:String>
        </bt:ShortStrings>
        <bt:LongStrings>
          <bt:String id="GenerateLink.Tooltip" DefaultValue="Génère un lien de réunion {{ .appName }} et l'insère dans l'événement.">
            <bt:Override Locale="de-DE" Value="Generiert einen {{ .appName }}-Besprechungslink und fügt ihn in den Termin ein."/>
            <bt:Override Locale="en-US" Value="Generates a {{ .appName }} meeting link and inserts it into the item."/>
          </bt:String>
          <bt:String id="TaskpaneButton.Tooltip" DefaultValue="Ouvre les paramètres de connexion {{ .appName }}.">
            <bt:Override Locale="de-DE" Value="Öffnet die {{ .appName }}-Verbindungseinstellungen."/>
            <bt:Override Locale="en-US" Value="Opens the {{ .appName }} connection settings."/>
          </bt:String>
          <bt:String id="OpenSettings.Tooltip" DefaultValue="Ouvre les paramètres de connexion {{ .appName }}.">
            <bt:Override Locale="de-DE" Value="Öffnet die {{ .appName }}-Verbindungseinstellungen."/>
            <bt:Override Locale="en-US" Value="Opens the {{ .appName }} connection settings."/>
          </bt:String>
        </bt:LongStrings>
      </Resources>
    </VersionOverrides>
  </VersionOverrides>
</OfficeApp>
